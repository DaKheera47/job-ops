/**
 * One-off smoke test for the HN extractor against the live Algolia API.
 * Confirms the parser actually picks up jobs from the most recent
 * "Who is hiring?" thread.  Run only when there's network access.
 *
 *   docker run --rm --network host \
 *     -v "$(pwd):/app" -w /app node:22-slim \
 *     node scripts/smoke-test-hn.cjs
 *
 * (Intel proxy: set HTTPS_PROXY env if needed.)
 */

const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: "application/json" } }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

(async () => {
  console.log("Fetching latest Who-is-hiring threads from Algolia HN...");
  const stories = await get(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=20",
  );
  const whoIsHiring = (stories.hits ?? []).filter(
    (h) =>
      /\bwho is hiring\b/i.test(h.title ?? "") &&
      !/(seeking freelancer|wants to be hired|freelancer)/i.test(h.title ?? ""),
  );
  if (whoIsHiring.length === 0) {
    console.log("No matching threads found.");
    process.exit(1);
  }
  whoIsHiring
    .sort((a, b) => (b.created_at_i ?? 0) - (a.created_at_i ?? 0))
    .slice(0, 3)
    .forEach((s) =>
      console.log(`  • [${s.objectID}] ${s.title} (created ${s.created_at})`),
    );
  const top = whoIsHiring[0];

  console.log(`\nFetching comments for ${top.objectID}...`);
  const comments = await get(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${top.objectID}&hitsPerPage=1000`,
  );
  const hits = comments.hits ?? [];
  console.log(`  ${hits.length} comments fetched.`);

  // Apply the same parser we ship in the extractor.
  const HEADER_RE = /\s+[|·–—-]\s+/;
  const ROLE_RE =
    /\b(engineer|developer|programmer|architect|designer|scientist|manager|director|lead|head|founder|cto|cpo|vp|recruiter|analyst|consultant|specialist|coordinator|admin|administrator|operator|writer|copywriter|marketer|sre|devops|qa|tester|researcher|intern|trader|product|principal|staff|senior|junior|sde|swe|pm|tpm|epm|ml|ai|data|frontend|backend|fullstack|full-stack|mobile|ios|android|web)\b/i;
  const REMOTE_RE = /\b(remote|anywhere|distributed|wfh|fully[ -]remote)\b/i;
  const ONSITE_RE = /\b(onsite\s*only|no remote)\b/i;
  const INTERN_RE = /\b(intern(ship)?(\s*only)?|summer intern)\b/i;

  function strip(html) {
    return html
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .trim();
  }

  let total = 0,
    parsed = 0,
    remote = 0;
  const samples = [];
  for (const hit of hits) {
    if (hit.parent_id !== hit.story_id) continue;
    if (!hit.comment_text) continue;
    total++;
    const text = strip(hit.comment_text);
    const header = text.split(/\n\s*\n/, 1)[0]?.slice(0, 400) ?? "";
    if (INTERN_RE.test(header)) continue;
    const parts = header.split(HEADER_RE).map((p) => p.trim());
    if (parts.length < 2) continue;
    if (!parts[0] || parts[0].length > 120) continue;
    const role = parts.find((p) => ROLE_RE.test(p));
    if (!role) continue;
    parsed++;
    const isRemote = REMOTE_RE.test(header) && !ONSITE_RE.test(header);
    if (isRemote) {
      remote++;
      if (samples.length < 10) {
        samples.push({ company: parts[0], role, header: header.slice(0, 100) });
      }
    }
  }

  console.log(
    `\nTop-level comments: ${total}; parser yielded ${parsed}; remote: ${remote}`,
  );
  console.log("\nSample remote postings:");
  samples.forEach((s, i) =>
    console.log(`  ${i + 1}. ${s.company} — ${s.role}`),
  );
})().catch((err) => {
  console.error("smoke test failed:", err.message);
  process.exit(1);
});
