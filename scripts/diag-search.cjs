const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db", { readonly: true });

const total = db.prepare("SELECT COUNT(*) AS c FROM jobs").get().c;
const byStatus = db
  .prepare("SELECT status, COUNT(*) AS c FROM jobs GROUP BY status ORDER BY c DESC")
  .all();
const bySource = db
  .prepare("SELECT source, COUNT(*) AS c FROM jobs GROUP BY source ORDER BY c DESC")
  .all();
const scoreBuckets = db
  .prepare(
    `SELECT
       CASE
         WHEN suitability_score IS NULL THEN 'NULL'
         WHEN suitability_score >= 70 THEN '70-100'
         WHEN suitability_score >= 50 THEN '50-69'
         WHEN suitability_score >= 35 THEN '35-49'
         ELSE '0-34'
       END AS bucket,
       COUNT(*) AS c
     FROM jobs GROUP BY bucket ORDER BY bucket DESC`,
  )
  .all();

const recent = db
  .prepare(
    `SELECT id, title, employer, location, source, status, suitability_score AS s, is_remote AS r
     FROM jobs ORDER BY discovered_at DESC LIMIT 30`,
  )
  .all();

const sampleReasons = db
  .prepare(
    `SELECT title, suitability_score AS s, suitability_reason AS reason
     FROM jobs WHERE suitability_reason IS NOT NULL
     ORDER BY discovered_at DESC LIMIT 15`,
  )
  .all();

const skipReasons = db
  .prepare(
    `SELECT suitability_reason AS reason, COUNT(*) AS c FROM jobs
     WHERE status='skipped' GROUP BY suitability_reason ORDER BY c DESC LIMIT 15`,
  )
  .all();

const titleTopWords = db
  .prepare(
    `SELECT title FROM jobs ORDER BY discovered_at DESC LIMIT 500`,
  )
  .all();

const wordCount = {};
for (const r of titleTopWords) {
  for (const w of (r.title || "").toLowerCase().split(/[^a-z+]+/)) {
    if (w.length < 4) continue;
    wordCount[w] = (wordCount[w] || 0) + 1;
  }
}
const topTitleWords = Object.entries(wordCount)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 30);

const runs = db
  .prepare(
    `SELECT id, status, started_at AS startedAt, jobs_discovered AS d, jobs_scored AS s,
            jobs_auto_skipped AS skipped, jobs_processed AS p,
            config_snapshot AS configSnapshot, error_message AS err
     FROM pipeline_runs ORDER BY started_at DESC LIMIT 5`,
  )
  .all();

const resume = db
  .prepare(`SELECT resume_json AS data FROM design_resume_documents ORDER BY updated_at DESC LIMIT 1`)
  .get();

const settings = db
  .prepare(`SELECT key, value FROM settings`)
  .all();
const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

console.log(JSON.stringify({
  total,
  byStatus,
  bySource,
  scoreBuckets,
  recent: recent.map((r) => ({ ...r, title: (r.title || "").slice(0, 70) })),
  sampleReasons: sampleReasons.map((r) => ({ ...r, reason: (r.reason || "").slice(0, 160) })),
  skipReasons: skipReasons.map((r) => ({ ...r, reason: (r.reason || "").slice(0, 160) })),
  topTitleWords,
  runs: runs.map((r) => {
    let cfg = null;
    try { cfg = JSON.parse(r.configSnapshot); } catch {}
    return { ...r, configSnapshot: cfg };
  }),
  resumeHeadline: resume ? (() => {
    try {
      const j = JSON.parse(resume.data);
      return {
        name: j?.basics?.name,
        headline: j?.basics?.headline,
        summary: (j?.summary?.content || "").replace(/<[^>]+>/g, " ").slice(0, 400),
        skillsCount: j?.sections?.skills?.items?.length || 0,
        skills: (j?.sections?.skills?.items || []).map((s) => s.name).slice(0, 10),
        experienceCount: j?.sections?.experience?.items?.length || 0,
        firstPositions: (j?.sections?.experience?.items || []).slice(0, 5).map((e) => e.position),
        languages: (j?.sections?.languages?.items || []).map((l) => l.language || l.name),
      };
    } catch (e) { return { error: e.message }; }
  })() : null,
  llmRelevantSettings: Object.fromEntries(
    Object.entries(settingsMap).filter(([k]) =>
      /llm|model|provider|api|pipeline|score|auto|filter|relocation/i.test(k),
    ),
  ),
}, null, 2));
