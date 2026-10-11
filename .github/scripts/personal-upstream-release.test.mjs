import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import { alreadyIncluded, checkRelease, selectRelease } from "./personal-upstream-release.mjs";

const release = {
  id: 1,
  draft: false,
  prerelease: true,
  tag_name: "v0.0.46-nightly.20261011.2967",
  published_at: "2026-10-11T08:07:32Z",
};
const sha = "a".repeat(40);

NodeTest.test(
  "selects the newest publication even when previews or older releases lead the response",
  () => {
    const stable = {
      ...release,
      id: 2,
      tag_name: "v0.0.45",
      prerelease: false,
      published_at: "2026-10-02T08:00:00Z",
    };
    const preview = {
      ...release,
      id: 3,
      tag_name: "v0.0.46-preview.20261011.3000",
      published_at: "2026-10-11T09:00:00Z",
    };
    NodeAssert.equal(selectRelease([preview, stable, release]), release);
    NodeAssert.equal(
      selectRelease([
        { ...release, draft: true },
        { ...stable, published_at: "invalid" },
      ]),
      null,
    );
  },
);

NodeTest.test("does not downgrade a fork that already contains the released commit", () => {
  NodeAssert.equal(alreadyIncluded({ status: "ahead" }), true);
  NodeAssert.equal(alreadyIncluded({ status: "identical" }), true);
  NodeAssert.equal(alreadyIncluded({ status: "diverged" }), false);
  NodeAssert.equal(alreadyIncluded({ status: "behind" }), false);
  NodeAssert.throws(() => alreadyIncluded({ status: "unknown" }));
});

function fixture({ status = "diverged", busy = false, delivered = false, annotated = false } = {}) {
  const notifications = [];
  const api = async (route) => {
    if (route.includes("/releases?")) return [release];
    if (route.includes("/git/ref/")) return { object: { type: annotated ? "tag" : "commit", sha } };
    if (route.includes("/git/tags/")) return { object: { type: "commit", sha } };
    if (route.includes("/compare/")) return { status };
    if (route.includes("/runs?"))
      return { workflow_runs: [{ status: busy ? "in_progress" : "completed" }] };
    if (route.includes("/artifacts?"))
      return { artifacts: delivered ? [{ name: `ahi-upstream-${sha}`, expired: false }] : [] };
    throw new Error(`Unexpected API request: ${route}`);
  };
  return {
    api,
    notifications,
    deliver: async (payload) => {
      notifications.push(payload);
    },
  };
}

NodeTest.test(
  "coalesces already-included, in-progress builds, and delivered releases without another agent",
  async () => {
    for (const [options, status] of [
      [{ status: "ahead" }, "already-included"],
      [{ busy: true }, "build-running"],
      [{ delivered: true }, "already-delivered"],
    ]) {
      const f = fixture(options);
      NodeAssert.equal((await checkRelease(f)).status, status);
      NodeAssert.equal(f.notifications.length, 0);
    }
  },
);

NodeTest.test(
  "resolves an annotated tag and sends only the canonical upstream release",
  async () => {
    const f = fixture({ annotated: true });
    const result = await checkRelease(f);
    NodeAssert.equal(result.status, "delivered");
    NodeAssert.equal(f.notifications.length, 1);
    NodeAssert.equal(f.notifications[0].repository.full_name, "pingdotgg/t3code");
    NodeAssert.equal(f.notifications[0].release.commit_sha, sha);
    NodeAssert.equal(f.notifications[0].release.id, release.id);
  },
);

NodeTest.test("manual retry bypasses the receipt but still skips an included commit", async () => {
  const f = fixture({ delivered: true });
  NodeAssert.equal((await checkRelease({ ...f, force: true })).status, "delivered");
  const included = fixture({ status: "ahead", delivered: true });
  NodeAssert.equal((await checkRelease({ ...included, force: true })).status, "already-included");
});

NodeTest.test("delivery failure does not record a successful notification", async () => {
  await NodeAssert.rejects(
    checkRelease({
      ...fixture(),
      deliver: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
});
