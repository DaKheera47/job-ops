/**
 * Database utility scripts.
 */

import { join } from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "../config/dataDir.js";

// Database path - can be overridden via env for Docker
const DB_PATH = join(getDataDir(), "jobs.db");

/**
 * Clear all data from the database (keeps the schema intact).
 */
export function clearDatabase(): { jobsDeleted: number; runsDeleted: number } {
  const sqlite = new Database(DB_PATH);

  try {
    sqlite.prepare("DELETE FROM stage_events").run();
    sqlite.prepare("DELETE FROM tasks").run();
    sqlite.prepare("DELETE FROM interviews").run();
    const jobsResult = sqlite.prepare("DELETE FROM jobs").run();
    const runsResult = sqlite.prepare("DELETE FROM pipeline_runs").run();

    console.log(
      `🗑️ Cleared database: ${jobsResult.changes} jobs, ${runsResult.changes} pipeline runs`,
    );
    return {
      jobsDeleted: jobsResult.changes,
      runsDeleted: runsResult.changes,
    };
  } finally {
    sqlite.close();
  }
}

/**
 * Delete database file completely (will recreate on next run).
 */
export function dropDatabase(): void {
  const { unlinkSync, existsSync } = require("node:fs");

  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log("🗑️ Database file deleted");
  } else {
    console.log("ℹ️ No database file to delete");
  }
}

// CLI execution
if (process.argv[1]?.includes("clear.ts")) {
  const arg = process.argv[2];

  if (arg === "--drop") {
    dropDatabase();
  } else {
    clearDatabase();
  }
}
