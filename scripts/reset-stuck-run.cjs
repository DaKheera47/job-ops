// Mark the stuck pipeline run as failed and reset any related state.
const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db");

const stuck = db
  .prepare(`SELECT id, status, started_at FROM pipeline_runs WHERE status='running'`)
  .all();
console.log("Stuck runs:", stuck);

const now = new Date().toISOString();
const result = db
  .prepare(
    `UPDATE pipeline_runs SET status='failed',
     completed_at=?, error_message='Forcibly reset: stuck run after mockScore regression'
     WHERE status='running'`,
  )
  .run(now);
console.log("Reset rows:", result.changes);

// Sanity check
const after = db.prepare(`SELECT status, COUNT(*) AS c FROM pipeline_runs GROUP BY status`).all();
console.log("After:", after);
