import { runNaukri } from "./run.js";

const result = await runNaukri({
  searchTerms: process.env.NAUKRI_SEARCH_TERMS
    ? JSON.parse(process.env.NAUKRI_SEARCH_TERMS)
    : undefined,
  maxJobsPerTerm: process.env.NAUKRI_MAX_JOBS_PER_TERM
    ? Number.parseInt(process.env.NAUKRI_MAX_JOBS_PER_TERM, 10)
    : undefined,
});

if (!result.success) {
  console.error(result.error ?? "Naukri extractor failed");
  process.exit(1);
}

console.log(JSON.stringify(result.jobs, null, 2));
