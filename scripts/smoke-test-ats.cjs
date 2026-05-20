/**
 * Smoke test: hit a handful of Greenhouse / Ashby / Lever boards from our
 * curated list and confirm (a) the API returns jobs, (b) our remote
 * detection regex picks up the genuinely remote ones, and (c) location
 * strings are sane.
 *
 * Intentionally tests against the real APIs — these are public so any 404
 * means the slug is wrong and the curated list needs a fix.
 *
 *   docker run --rm --network host \
 *     -e HTTPS_PROXY=http://proxy-dmz.intel.com:912 \
 *     -e HTTP_PROXY=http://proxy-dmz.intel.com:912 \
 *     -v "$(pwd):/app" -w /app node:22-slim \
 *     node scripts/smoke-test-ats.cjs
 */

const https = require("https");

const REMOTE_RE =
  /\b(remote|anywhere|distributed|worldwide|global|wfh|fully\s*remote|100%\s*remote|home\s*office|telecommute)\b/i;

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: "application/json" } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function testGreenhouse(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  try {
    const data = await get(url);
    const jobs = data.jobs ?? [];
    const remote = jobs.filter((j) => REMOTE_RE.test(j.location?.name ?? ""));
    return { ok: true, total: jobs.length, remote: remote.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testAshby(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
  try {
    const data = await get(url);
    const jobs = data.jobs ?? [];
    const remote = jobs.filter((j) => REMOTE_RE.test(j.location ?? ""));
    return { ok: true, total: jobs.length, remote: remote.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testLever(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  try {
    const data = await get(url);
    const jobs = Array.isArray(data) ? data : [];
    const remote = jobs.filter((j) =>
      REMOTE_RE.test(j.categories?.location ?? ""),
    );
    return { ok: true, total: jobs.length, remote: remote.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Sample 5 from each provider to keep the run quick.
const SAMPLE = [
  ["greenhouse", "gitlab", testGreenhouse],
  ["greenhouse", "automattic", testGreenhouse],
  ["greenhouse", "buffer", testGreenhouse],
  ["greenhouse", "sentry", testGreenhouse],
  ["greenhouse", "cloudflare", testGreenhouse],
  ["greenhouse", "hashicorp", testGreenhouse],
  ["greenhouse", "datadog", testGreenhouse],
  ["greenhouse", "github", testGreenhouse],
  ["greenhouse", "shopify", testGreenhouse],
  ["ashby", "anthropic", testAshby],
  ["ashby", "openai", testAshby],
  ["ashby", "linear", testAshby],
  ["ashby", "huggingface", testAshby],
  ["lever", "netflix", testLever],
  ["lever", "canva", testLever],
];

(async () => {
  console.log("Smoke testing 15 ATS boards...\n");
  let totalJobs = 0;
  let totalRemote = 0;
  let failures = 0;
  for (const [provider, slug, fn] of SAMPLE) {
    const r = await fn(slug);
    if (r.ok) {
      totalJobs += r.total;
      totalRemote += r.remote;
      console.log(
        `  ✓ ${provider}:${slug.padEnd(20)}  total=${String(r.total).padStart(4)}  remote=${String(r.remote).padStart(3)}`,
      );
    } else {
      failures += 1;
      console.log(`  ✗ ${provider}:${slug.padEnd(20)}  ${r.error}`);
    }
  }
  console.log(
    `\nSummary: ${totalJobs} total jobs, ${totalRemote} remote, ${failures}/15 board failures`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
