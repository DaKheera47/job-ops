/**
 * Wipe all `discovered` and `expired` jobs. Keep skipped (dedup tool),
 * applied (user submitted), in_progress (active interviews), ready
 * (tailored & queued). Same invariant as everywhere else in the codebase:
 * applied / in_progress / ready represent real user investment.
 *
 * Use after a regression that filled the DB with garbage scores or
 * irrelevant listings.
 */
const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db");

console.log("--- BEFORE ---");
console.log(
  db
    .prepare(
      "SELECT status, COUNT(*) AS c FROM jobs GROUP BY status ORDER BY c DESC",
    )
    .all(),
);

const result = db
  .prepare(`DELETE FROM jobs WHERE status IN ('discovered', 'expired')`)
  .run();
console.log("Deleted:", result.changes);

console.log("--- AFTER ---");
console.log(
  db
    .prepare(
      "SELECT status, COUNT(*) AS c FROM jobs GROUP BY status ORDER BY c DESC",
    )
    .all(),
);
console.log("done");
