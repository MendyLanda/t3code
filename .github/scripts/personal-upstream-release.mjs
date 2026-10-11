import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

export const upstream = "pingdotgg/t3code";
const personal = "MendyLanda/t3code";

// Previews belong to individual PRs. Only published stable and nightly builds drive syncs.
export function selectRelease(releases) {
  return (
    releases
      .filter((release) => {
        if (release.draft || !Number.isSafeInteger(release.id) || !release.published_at)
          return false;
        if (!Number.isFinite(Date.parse(release.published_at))) return false;
        const nightly = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(release.tag_name);
        const stable = /^v\d+\.\d+\.\d+$/.test(release.tag_name);
        return (nightly && release.prerelease === true) || (stable && release.prerelease === false);
      })
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0] ?? null
  );
}

export function alreadyIncluded(comparison) {
  if (!["ahead", "behind", "diverged", "identical"].includes(comparison.status)) {
    throw new Error("GitHub returned an unknown comparison status.");
  }
  return comparison.status === "ahead" || comparison.status === "identical";
}

export async function checkRelease({ api, deliver, force = false }) {
  const release = selectRelease(await api(`/repos/${upstream}/releases?per_page=100`));
  if (!release) return { status: "no-release" };
  let object = (
    await api(`/repos/${upstream}/git/ref/tags/${encodeURIComponent(release.tag_name)}`)
  ).object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth++) {
    object = (await api(`/repos/${upstream}/git/tags/${object.sha}`)).object;
  }
  if (object.type !== "commit" || !/^[a-f0-9]{40}$/.test(object.sha)) {
    throw new Error("The upstream release did not resolve to a commit.");
  }
  const sha = object.sha;
  const comparison = await api(`/repos/${upstream}/compare/${sha}...MendyLanda:personal`);
  if (alreadyIncluded(comparison))
    return { status: "already-included", tag: release.tag_name, sha };

  for (const workflow of ["personal-desktop.yml", "personal-mobile.yml"]) {
    const runs = await api(
      `/repos/${personal}/actions/workflows/${workflow}/runs?branch=personal&per_page=20`,
    );
    if (runs.workflow_runs.some((run) => run.status !== "completed")) {
      return { status: "build-running", tag: release.tag_name, sha };
    }
  }

  const receiptName = `ahi-upstream-${sha}`;
  if (!force) {
    const artifacts = await api(
      `/repos/${personal}/actions/artifacts?name=${receiptName}&per_page=100`,
    );
    if (
      artifacts.artifacts.some((artifact) => artifact.name === receiptName && !artifact.expired)
    ) {
      return { status: "already-delivered", tag: release.tag_name, sha };
    }
  }

  await deliver({
    action: "published",
    repository: { full_name: upstream },
    release: {
      id: release.id,
      tag_name: release.tag_name,
      commit_sha: sha,
      published_at: release.published_at,
    },
  });
  return { status: "delivered", tag: release.tag_name, sha, receiptName };
}

async function main() {
  if (
    process.env.GITHUB_REPOSITORY !== personal ||
    process.env.GITHUB_REF !== "refs/heads/personal"
  ) {
    throw new Error("This detector only runs on the personal AHi branch.");
  }
  const webhook = process.env.PERSONAL_UPSTREAM_WEBHOOK_URL;
  if (!webhook) throw new Error("The private AHi webhook secret is missing.");
  const api = async (route) => {
    const response = await fetch(`https://api.github.com${route}`, {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}.`);
    return response.json();
  };
  const result = await checkRelease({
    api,
    force: process.env.FORCE_DELIVERY === "true",
    deliver: async (payload) => {
      let response;
      try {
        response = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000),
          redirect: "error",
        });
      } catch {
        // Network errors may include the URL's credential. Keep it out of public logs.
        throw new Error("The private AHi webhook could not be reached.");
      }
      if (!response.ok) throw new Error(`The AHi webhook returned HTTP ${response.status}.`);
      await response.body?.cancel();
    },
  });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    NodeFS.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `AHi upstream check: ${result.status}${result.tag ? `, ${result.tag}` : ""}.\n`,
    );
  }
  if (result.status === "delivered") {
    NodeFS.writeFileSync(
      "upstream-delivery.json",
      JSON.stringify({ ...result, deliveredAt: new Date().toISOString() }, null, 2),
    );
    NodeFS.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `delivered=true\nreceipt_name=${result.receiptName}\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
