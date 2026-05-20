const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db", { readonly: true });

console.log("=== Last 5 pipeline runs — full details ===");
const runs = db
  .prepare(
    "SELECT id, status, started_at, completed_at, config_snapshot, requested_config, effective_config, result_summary, jobs_discovered, error_message FROM pipeline_runs ORDER BY started_at DESC LIMIT 5",
  )
  .all();
for (const r of runs) {
  console.log("\n--- run", r.id, r.started_at, "→", r.status, "(", r.jobs_discovered, "discovered )");
  if (r.error_message) console.log("  ERROR:", r.error_message);
  console.log("  config_snapshot:");
  try {
    const cfg = JSON.parse(r.config_snapshot);
    console.log("    sources:", cfg.sources);
    console.log("    topN:", cfg.topN, "minScore:", cfg.minSuitabilityScore);
    console.log("    locationIntent:", JSON.stringify(cfg.locationIntent));
  } catch (e) {
    console.log("    (could not parse)", r.config_snapshot?.slice(0, 200));
  }
  console.log("  effective_config:");
  try {
    const ec = JSON.parse(r.effective_config);
    console.log("    searchTerms:", ec.searchTerms);
    console.log("    sources:", ec.sources);
    console.log("    locationIntent:", JSON.stringify(ec.locationIntent));
  } catch (e) {
    console.log("    (no parse)", r.effective_config?.slice(0, 400));
  }
  console.log("  result_summary:");
  try {
    const rs = JSON.parse(r.result_summary);
    console.log("    " + JSON.stringify(rs, null, 2).split("\n").join("\n    "));
  } catch (e) {
    console.log("    (no parse)", r.result_summary?.slice(0, 200));
  }
}

console.log("\n=== Search terms setting ===");
const st = db.prepare("SELECT value FROM settings WHERE key='searchTerms'").get();
console.log("  searchTerms =", st?.value);

console.log("\n=== Any 'extractor' or 'source' or 'search' settings ===");
const all = db.prepare("SELECT key, value FROM settings WHERE key LIKE '%extractor%' OR key LIKE '%source%' OR key LIKE '%search%' OR key LIKE '%location%' OR key LIKE '%workplace%' OR key LIKE '%jobspy%' OR key LIKE '%pipeline%'").all();
for (const row of all) {
  const v = row.value && row.value.length > 200 ? row.value.slice(0, 200) + "…" : row.value;
  console.log(`  ${row.key} = ${v}`);
}

db.close();
