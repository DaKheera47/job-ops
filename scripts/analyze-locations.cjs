// Deep analysis: what cities/countries are in the DB and how many would
// fail a stricter Munich-or-remote filter.

const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db", { readonly: true });

const MUNICH_KEYWORDS = [
  "munich", "münchen", "muenchen",
  "garching", "gräfelfing", "graefelfing",
  "unterföhring", "unterfoehring",
  "kirchheim", "germering", "aschheim", "ottobrunn",
  "planegg", "martinsried", "neubiberg", "haar",
  "ismaning", "oberhaching", "vaterstetten",
  "putzbrunn", "pullach", "taufkirchen",
];

const rows = db
  .prepare(
    "SELECT id, status, employer, title, location, is_remote, work_from_home_type, source " +
      "FROM jobs WHERE status IN ('discovered','skipped','ready')",
  )
  .all();

console.log(`Total scanned: ${rows.length}`);

// Bucket 1: location explicitly Munich-area
let bucketMunich = 0;
// Bucket 2: is_remote=1 AND location IS Munich/empty/unspecified
let bucketRemoteMunich = 0;
// Bucket 3: is_remote=1 AND location is some OTHER city (suspect: extractor mis-flagged)
let bucketRemoteElsewhere = 0;
// Bucket 4: is_remote=0/null AND location is some OTHER city (clear relocation)
let bucketRelocation = 0;
// Bucket 5: no info at all
let bucketUnknown = 0;

const otherCityStats = new Map();
const relocationSamples = [];
const remoteElsewhereSamples = [];

for (const r of rows) {
  const loc = (r.location || "").toLowerCase().trim();
  const munich = loc && MUNICH_KEYWORDS.some((k) => loc.includes(k));
  const remote = r.is_remote === 1 || (r.work_from_home_type || "").toLowerCase().includes("remote");

  if (munich) {
    bucketMunich++;
  } else if (!loc) {
    if (remote) bucketRemoteMunich++;
    else bucketUnknown++;
  } else if (remote) {
    bucketRemoteElsewhere++;
    otherCityStats.set(loc, (otherCityStats.get(loc) || 0) + 1);
    if (remoteElsewhereSamples.length < 15) remoteElsewhereSamples.push(r);
  } else {
    bucketRelocation++;
    otherCityStats.set(loc, (otherCityStats.get(loc) || 0) + 1);
    if (relocationSamples.length < 25) relocationSamples.push(r);
  }
}

console.log("");
console.log("=== Buckets ===");
console.log(`  1. Munich-area (any remote flag):           ${bucketMunich}`);
console.log(`  2. is_remote=1 + empty location:            ${bucketRemoteMunich}`);
console.log(`  3. is_remote=1 + ELSEWHERE city:            ${bucketRemoteElsewhere}`);
console.log(`  4. NOT remote + ELSEWHERE city (RELOC):     ${bucketRelocation}`);
console.log(`  5. No location, no remote flag:             ${bucketUnknown}`);

console.log("");
console.log("=== Top other-city locations (bucket 3+4) ===");
const sorted = Array.from(otherCityStats.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);
for (const [loc, n] of sorted) console.log(`  ${n}\t${loc}`);

console.log("");
console.log("=== Sample bucket 4 (NOT remote + elsewhere = clear relocation) ===");
for (const r of relocationSamples) {
  console.log(
    `  [${r.status}] (${r.source}) ${r.employer} | ${r.title} | loc="${r.location}" | is_remote=${r.is_remote}`,
  );
}

console.log("");
console.log("=== Sample bucket 3 (is_remote=1 but loc=elsewhere — verify if truly remote) ===");
for (const r of remoteElsewhereSamples) {
  console.log(
    `  [${r.status}] (${r.source}) ${r.employer} | ${r.title} | loc="${r.location}" | is_remote=${r.is_remote} | wfh="${r.work_from_home_type || ""}"`,
  );
}

db.close();
