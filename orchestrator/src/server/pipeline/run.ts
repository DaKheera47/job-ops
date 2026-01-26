/**
 * Standalone script to run the pipeline.
 * Can be triggered by n8n or cron.
 *
 * Usage: npm run pipeline:run
 */

import "../config/env.js";
import { closeDb } from "../db/index.js";
import { runPipeline } from "./orchestrator.js";

async function main() {
  console.log("=".repeat(60));
  console.log("🚀 Job Pipeline Runner");
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  const result = await runPipeline({
    topN: parseInt(process.env.PIPELINE_TOP_N || "10", 10),
    minSuitabilityScore: parseInt(process.env.PIPELINE_MIN_SCORE || "50", 10),
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 Pipeline Results:");
  console.log(`   Success: ${result.success}`);
  console.log(`   Jobs Discovered: ${result.jobsDiscovered}`);
  console.log(`   Jobs Processed: ${result.jobsProcessed}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  console.log(`   Completed at: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  closeDb();
  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  closeDb();
  process.exit(1);
});
