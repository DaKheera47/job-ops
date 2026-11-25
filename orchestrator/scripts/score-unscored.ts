import { scoreJobsStep } from "../src/server/pipeline/steps/score-jobs";
import { getProfile } from "../src/server/services/profile";

// Scores every discovered job that has no score yet, without running a search.
const profile = await getProfile();
const { scoredJobs } = await scoreJobsStep({ profile });
console.log(`Scored ${scoredJobs.length} jobs.`);
process.exit(0);
