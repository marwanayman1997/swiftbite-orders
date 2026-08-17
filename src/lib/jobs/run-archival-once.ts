import { REGIONS } from "../sharding/regions.ts";
import { destroyAll } from "../knex/knex.ts";
import { runArchivalOnce } from "./archival.worker.ts";

// Standalone one-shot entrypoint — what a real external cron/k8s CronJob
// would target, and the vehicle for local testing (the crash-mid-batch
// acceptance test needs a kill-9-able standalone process, which the
// always-running dev server doesn't offer). Shares runArchivalOnce with the
// in-process scheduler (archival-scheduler.ts) — no duplicated logic.
const regionArg = process.argv
  .find((a) => a.startsWith("--region="))
  ?.split("=")[1];
const regions = regionArg ? [regionArg] : REGIONS;

async function main(): Promise<void> {
  for (const region of regions) {
    const summary = await runArchivalOnce(region);
    console.log(
      `[run-archival-once] region=${region} moved=${summary.totalMoved}`,
    );
  }
}

main()
  .then(async () => {
    await destroyAll();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[run-archival-once] failed:", err);
    await destroyAll().catch(() => {});
    process.exit(1);
  });
