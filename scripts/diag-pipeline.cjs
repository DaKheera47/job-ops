// Diagnostic script: inspect recent pipeline runs and job status counts.
const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db", { readonly: true });

console.log("=== Recent pipeline runs (last 10) ===");
const runs = db
  .prepare(
    `SELECT id, status, started_at, completed_at, jobs_searched, jobs_discovered,
            jobs_liveness_filtered, jobs_deduplicated, jobs_scored, jobs_auto_skipped,
            jobs_ghost_flagged, jobs_selected, jobs_processed, jobs_expired, error_message
     FROM pipeline_runs ORDER BY started_at DESC LIMIT 10`,
  )
  .all();
for (const r of runs) {
  console.log(JSON.stringify(r, null, 2));
}

console.log("\n=== Job status counts ===");
const statusCounts = db
  .prepare("SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC")
  .all();
for (const s of statusCounts) console.log(`  ${s.status}: ${s.count}`);

console.log("\n=== Score distribution (scored jobs) ===");
const scoreRanges = db
  .prepare(
    `SELECT
       CASE
         WHEN suitability_score IS NULL THEN 'null'
         WHEN suitability_score < 20 THEN '00-19'
         WHEN suitability_score < 40 THEN '20-39'
         WHEN suitability_score < 60 THEN '40-59'
         WHEN suitability_score < 80 THEN '60-79'
         ELSE '80-100'
       END as bucket,
       COUNT(*) as count
     FROM jobs
     WHERE status IN ('discovered','skipped','ready','applied','in_progress')
     GROUP BY bucket
     ORDER BY bucket`,
  )
  .all();
for (const s of scoreRanges) console.log(`  ${s.bucket}: ${s.count}`);

console.log("\n=== Skipped jobs — sample reasons (most recent 15) ===");
const skipped = db
  .prepare(
    `SELECT id, title, employer, suitability_score, suitability_reason, location, is_remote, discovered_at
     FROM jobs WHERE status='skipped' ORDER BY discovered_at DESC LIMIT 15`,
  )
  .all();
for (const j of skipped) {
  console.log(
    `  [${j.suitability_score}] "${j.title}" @ ${j.employer} (${j.location}, remote=${j.is_remote}) — ${(j.suitability_reason || "").slice(0, 120)}`,
  );
}

console.log("\n=== Settings affecting volume ===");
const keys = [
  "pipelineMaxJobsToScore",
  "pipelineAutoSkipBelow",
  "autoSkipScoreThreshold",
  "minSuitabilityScore",
  "topN",
  "modelScorer",
  "modelTailoring",
  "modelProjectSelection",
  "llmProvider",
  "llmAnthropicApiKey",
  "locationSearchScope",
  "locationMatchStrictness",
  "workplaceTypes",
  "searchCities",
  "jobspyLocation",
  "jobspyCountryIndeed",
];
for (const k of keys) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(k);
  const v = row ? row.value : "(unset)";
  const display = v && v.length > 80 ? v.slice(0, 80) + "…" : v;
  console.log(`  ${k} = ${display}`);
}

console.log("\n=== Jobs discovered in last 7 days ===");
const recent = db
  .prepare(
    `SELECT DATE(discovered_at) as day, COUNT(*) as count, source
     FROM jobs WHERE discovered_at >= datetime('now', '-7 days')
     GROUP BY day, source ORDER BY day DESC, count DESC`,
  )
  .all();
for (const r of recent) console.log(`  ${r.day}  ${r.source.padEnd(20)}  ${r.count}`);

console.log("\n=== Recent discovered job count by source ===");
const lastRun = runs[0];
if (lastRun?.started_at) {
  const since = lastRun.started_at;
  console.log(`(since ${since})`);
  const bySrc = db
    .prepare(
      `SELECT source, status, COUNT(*) as count FROM jobs
       WHERE discovered_at >= ?
       GROUP BY source, status ORDER BY count DESC`,
    )
    .all(since);
  for (const r of bySrc) console.log(`  ${r.source.padEnd(20)} ${r.status.padEnd(15)} ${r.count}`);
}

db.close();
