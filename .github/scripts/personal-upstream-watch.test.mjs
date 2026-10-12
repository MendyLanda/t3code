import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import { checkOnce } from "./personal-upstream-watch.mjs";

const sha = "a".repeat(40);
const release = {
  id: 1,
  draft: false,
  prerelease: true,
  tag_name: "v0.0.46-nightly.20261012.3021",
  published_at: "2026-10-12T15:17:45Z",
};

function fixture(t) {
  const stateDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "ahi-watch-test-"));
  t.after(() => NodeFS.rmSync(stateDir, { recursive: true, force: true }));
  let active = [];
  let included = false;
  let builds = false;
  const deliveries = [];
  const api = async (route) => {
    if (route.includes("/releases?")) return [release];
    if (route.includes("/git/ref/")) return { object: { type: "commit", sha } };
    if (route.includes("/compare/")) return { status: included ? "ahead" : "diverged" };
    if (route.includes("/runs?"))
      return { workflow_runs: [{ status: builds ? "in_progress" : "completed" }] };
    if (route.includes("/artifacts?"))
      return { artifacts: [{ name: `ahi-upstream-${sha}`, expired: false }] };
    throw new Error("Unexpected API route.");
  };
  const options = {
    stateDir,
    api,
    task: { enabled: true, threadId: null },
    activeThreads: async () => active,
    deliver: async (payload) => {
      deliveries.push(payload);
    },
    now: () => new Date("2026-10-12T19:00:00Z"),
  };
  return {
    options,
    deliveries,
    active: (value) => {
      active = value;
    },
    included: () => {
      included = true;
    },
    builds: () => {
      builds = true;
    },
  };
}

NodeTest.test(
  "a failed or deleted worker can retry the same release despite its old delivery receipt",
  async (t) => {
    const f = fixture(t);
    NodeAssert.equal((await checkOnce(f.options)).status, "delivered");
    f.active(["first-worker"]);
    NodeAssert.equal(
      (await checkOnce({ ...f.options, now: () => new Date("2026-10-12T19:30:00Z") })).status,
      "agent-running",
    );
    f.active([]);
    NodeAssert.equal(
      (await checkOnce({ ...f.options, now: () => new Date("2026-10-12T20:00:00Z") })).status,
      "delivered",
    );
    NodeAssert.equal(f.deliveries.length, 2);
    NodeAssert.equal(f.deliveries[0].release.commit_sha, f.deliveries[1].release.commit_sha);
  },
);

NodeTest.test(
  "the dispatch window prevents overlapping workers before their rows appear",
  async (t) => {
    const f = fixture(t);
    await checkOnce(f.options);
    NodeAssert.equal(
      (await checkOnce({ ...f.options, now: () => new Date("2026-10-12T19:01:00Z") })).status,
      "delivery-pending",
    );
    NodeAssert.equal(f.deliveries.length, 1);
  },
);

NodeTest.test(
  "an included release, paused task, or active build does not start an agent",
  async (t) => {
    const included = fixture(t);
    included.included();
    NodeAssert.equal((await checkOnce(included.options)).status, "already-included");
    const paused = fixture(t);
    NodeAssert.equal(
      (await checkOnce({ ...paused.options, task: { enabled: false, threadId: null } })).status,
      "paused",
    );
    const busy = fixture(t);
    busy.builds();
    NodeAssert.equal((await checkOnce(busy.options)).status, "build-running");
    NodeAssert.equal(
      included.deliveries.length + paused.deliveries.length + busy.deliveries.length,
      0,
    );
  },
);

NodeTest.test(
  "a thread-bound task fails visibly instead of reporting a successful check",
  async (t) => {
    const f = fixture(t);
    await NodeAssert.rejects(
      checkOnce({ ...f.options, task: { enabled: true, threadId: "deleted-worker" } }),
      /fresh threads/,
    );
    NodeAssert.equal(f.deliveries.length, 0);
  },
);

NodeTest.test("a failed delivery retries after the short dispatch window", async (t) => {
  const f = fixture(t);
  await NodeAssert.rejects(
    checkOnce({
      ...f.options,
      deliver: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
  NodeAssert.equal(
    (await checkOnce({ ...f.options, now: () => new Date("2026-10-12T19:30:00Z") })).status,
    "delivered",
  );
});

NodeTest.test("a conflict needing a choice stays stopped until an explicit retry", async (t) => {
  const f = fixture(t);
  NodeFS.writeFileSync(
    NodePath.join(f.options.stateDir, "agent-result.json"),
    JSON.stringify({ status: "needs-input", sha }),
  );
  NodeAssert.equal((await checkOnce(f.options)).status, "needs-input");
  NodeAssert.equal(f.deliveries.length, 0);
  NodeAssert.equal((await checkOnce({ ...f.options, force: true })).status, "delivered");
  f.active(["worker"]);
  NodeAssert.equal((await checkOnce({ ...f.options, force: true })).status, "agent-running");
  NodeAssert.equal(f.deliveries.length, 1);
});
