import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { checkRelease } from "./personal-upstream-release.mjs";

const dispatchWindowMs = 10 * 60_000;
const taskId = "ahi-upstream-release-sync";
const projectId = "ahi-upstream-sync";

function save(stateDir, name, value) {
  NodeFS.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const target = NodePath.join(stateDir, name);
  const temporary = `${target}.${process.pid}.tmp`;
  NodeFS.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  NodeFS.renameSync(temporary, target);
}

export async function checkOnce({
  stateDir,
  task,
  activeThreads,
  api,
  deliver,
  now = () => new Date(),
  force = false,
}) {
  const checkedAt = now().toISOString();
  const finish = (result) => {
    const value = { ...result, checkedAt };
    save(stateDir, "last-check.json", value);
    return value;
  };
  if (!task?.enabled) return finish({ status: "paused" });
  if (task.threadId !== null) throw new Error("AHi sync must use fresh threads.");
  const active = await activeThreads();
  if (active.length) return finish({ status: "agent-running", activeThreads: active });

  const pendingPath = NodePath.join(stateDir, "last-delivery.json");
  if (NodeFS.existsSync(pendingPath)) {
    const pending = JSON.parse(NodeFS.readFileSync(pendingPath, "utf8"));
    const age = now().getTime() - Date.parse(pending.deliveredAt);
    if (!force && age < dispatchWindowMs)
      return finish({ status: "delivery-pending", sha: pending.sha });
  }

  let blocked = null;
  const result = await checkRelease({
    api,
    // Delivery receipts only prove dispatch. Failed/deleted workers must be able to retry.
    force: true,
    deliver: async (payload) => {
      const resultPath = NodePath.join(stateDir, "agent-result.json");
      if (!force && NodeFS.existsSync(resultPath)) {
        const previous = JSON.parse(NodeFS.readFileSync(resultPath, "utf8"));
        if (previous.status === "needs-input" && previous.sha === payload.release.commit_sha) {
          blocked = { status: "needs-input", sha: previous.sha };
          return;
        }
      }
      // Cover the gap between HTTP acceptance and the worker appearing in the projection.
      save(stateDir, "last-delivery.json", {
        sha: payload.release.commit_sha,
        deliveredAt: checkedAt,
      });
      await deliver(payload);
    },
  });
  return finish(blocked ?? result);
}

function command(executable, args, options = {}) {
  return NodeChildProcess.execFileSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
    ...options,
  });
}

async function main() {
  const stateDir =
    process.env.AHI_SYNC_STATE_DIR ??
    NodePath.join(NodeOS.homedir(), ".local/state/ahi-upstream-sync");
  const control = NodePath.join(stateDir, "control.cjs");
  const input = NodePath.join(stateDir, "empty.json");
  const output = NodePath.join(stateDir, "watch-tasks-private.json");
  save(stateDir, "empty.json", {});
  command(process.execPath, [control, "scheduledTasks.list", input, output]);
  const task = JSON.parse(NodeFS.readFileSync(output, "utf8")).tasks.find(
    (entry) => entry.id === taskId,
  );
  const database = NodePath.join(
    process.env.AHI_SYNC_HOME ?? NodePath.join(NodeOS.homedir(), ".t3"),
    "userdata/statev2.sqlite",
  );
  const activeThreads = async () =>
    JSON.parse(
      command("python3", [
        "-c",
        `
import sqlite3,json,sys
with sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True) as db:
 rows=db.execute("""SELECT t.thread_id FROM orchestration_v2_projection_threads t
 JOIN orchestration_v2_projection_runs r ON r.thread_id=t.thread_id
 WHERE t.project_id=? AND t.deleted_at IS NULL
 AND r.ordinal=(SELECT MAX(x.ordinal) FROM orchestration_v2_projection_runs x WHERE x.thread_id=t.thread_id)
 AND r.status IN ('queued','running')""",(sys.argv[2],)).fetchall()
 print(json.dumps([row[0] for row in rows]))
`,
        database,
        projectId,
      ]),
    );
  const api = async (route) => {
    const args = ["api", route];
    if (route.includes("/releases?"))
      args.push("--jq", "[.[] | {id,draft,prerelease,tag_name,published_at}]");
    return JSON.parse(command("gh", args));
  };
  const result = await checkOnce({
    stateDir,
    force: process.argv.includes("--force"),
    task,
    activeThreads,
    api,
    deliver: async (payload) => {
      if (!task.webhook?.path?.startsWith("/api/hooks/"))
        throw new Error("AHi webhook is missing.");
      let response;
      try {
        response = await fetch(`http://127.0.0.1:3773${task.webhook.path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(45_000),
          redirect: "error",
        });
      } catch {
        throw new Error("The local AHi webhook could not be reached.");
      }
      if (!response.ok) throw new Error(`AHi webhook returned HTTP ${response.status}.`);
      await response.body?.cancel();
    },
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    const stateDir =
      process.env.AHI_SYNC_STATE_DIR ??
      NodePath.join(NodeOS.homedir(), ".local/state/ahi-upstream-sync");
    save(stateDir, "last-check.json", { status: "failed", checkedAt: new Date().toISOString() });
    console.error("AHi upstream check failed. Inspect the private sync state and task status.");
    process.exitCode = 1;
  });
}
