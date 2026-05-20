/**
 * Probe every configured atsBoardSlugs entry, drop the ones that 404,
 * keep the ones that respond.  Stale slugs are noise in the pipeline:
 * each one costs a wasted HTTP request per run and confuses error logs.
 *
 * Idempotent — keeps only the live entries.
 *
 *   docker run --rm --network host \
 *     -e HTTPS_PROXY=http://proxy-dmz.intel.com:912 \
 *     -e HTTP_PROXY=http://proxy-dmz.intel.com:912 \
 *     -v "$(pwd):/app" -w /app node:22-slim \
 *     sh -c "apt-get update >/dev/null 2>&1 && apt-get install -y sqlite3 >/dev/null 2>&1 \
 *       && node /app/scripts/validate-ats-boards.cjs"
 */

const https = require("https");
const { spawnSync } = require("child_process");

const DB_PATH = process.env.JOB_OPS_DB ?? "/app/data/jobs.db";
const TENANT = "tenant_default";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: "application/json" } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      })
      .on("error", reject);
  });
}

const URL_BUILDERS = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
  smartrecruiters: (s) =>
    `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`,
  workday: () => null, // skip — workday tenants need full URL, not slug
};

async function probe(entry) {
  const builder = URL_BUILDERS[entry.provider];
  if (!builder) return { ok: true, reason: "unprobeable" };
  const url = builder(entry.slug);
  if (!url) return { ok: true, reason: "unprobeable" };
  try {
    const r = await get(url);
    if (r.statusCode >= 200 && r.statusCode < 300) {
      let total = -1;
      try {
        const parsed = JSON.parse(r.body);
        total = Array.isArray(parsed)
          ? parsed.length
          : Array.isArray(parsed.jobs)
            ? parsed.jobs.length
            : Array.isArray(parsed.content)
              ? parsed.content.length
              : -1;
      } catch {}
      return { ok: true, total };
    }
    return { ok: false, statusCode: r.statusCode };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sql(q) {
  const r = spawnSync("sqlite3", [DB_PATH, q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`sqlite3 failed: ${r.stderr}`);
  return r.stdout;
}
function sqlJson(q) {
  const r = spawnSync("sqlite3", ["-json", DB_PATH, q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`sqlite3 -json failed: ${r.stderr}`);
  const out = (r.stdout ?? "").trim();
  return out ? JSON.parse(out) : [];
}
const esc = (s) => String(s).replace(/'/g, "''");

(async () => {
  const rows = sqlJson(
    `SELECT value FROM settings WHERE tenant_id='${TENANT}' AND key='atsBoardSlugs'`,
  );
  const entries = JSON.parse(rows[0]?.value ?? "[]");
  console.log(`Probing ${entries.length} ATS slugs...\n`);

  const alive = [];
  const dead = [];
  let totalJobs = 0;
  for (const e of entries) {
    const r = await probe(e);
    if (r.ok) {
      alive.push(e);
      const status = r.total >= 0 ? `${r.total} jobs` : r.reason ?? "ok";
      console.log(
        `  ✓ ${e.provider}:${e.slug.padEnd(22)}  ${status}`,
      );
      if (r.total > 0) totalJobs += r.total;
    } else {
      dead.push(e);
      console.log(
        `  ✗ ${e.provider}:${e.slug.padEnd(22)}  ${r.statusCode ?? r.error}`,
      );
    }
  }

  console.log(`\nAlive: ${alive.length}  Dead: ${dead.length}  Total jobs: ${totalJobs}`);

  if (dead.length === 0) {
    console.log("Nothing to prune.");
    return;
  }

  if (process.argv.includes("--dry-run")) {
    console.log("\n(dry run; no DB changes)");
    return;
  }

  const json = JSON.stringify(alive);
  sql(
    `UPDATE settings SET value='${esc(json)}', updated_at=datetime('now') WHERE tenant_id='${esc(TENANT)}' AND key='atsBoardSlugs'`,
  );
  console.log(`\nPruned ${dead.length} dead entries from atsBoardSlugs.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
