import { runSeek } from "./run.js";

const searchTerms = (
  process.env.SEEK_SEARCH_TERMS
    ? JSON.parse(process.env.SEEK_SEARCH_TERMS)
    : ["software engineer"]
) as string[];

const location = process.env.SEEK_LOCATION ?? "All Australia";
const maxJobsPerTerm = parseInt(process.env.SEEK_MAX_JOBS_PER_TERM ?? "50", 10);

runSeek({ searchTerms, location, maxJobsPerTerm })
  .then((result) => {
    if (!result.success) {
      console.error(`Seek extractor failed: ${result.error}`);
      process.exitCode = 1;
    } else {
      console.log(`Seek extractor fetched ${result.jobs.length} jobs`);
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Seek extractor failed: ${message}`);
    process.exitCode = 1;
  });
