/**
 * Database migration script - creates tables if they don't exist.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getDataDir } from '../config/dataDir.js';

// Database path - can be overridden via env for Docker
const DB_PATH = join(getDataDir(), 'jobs.db');

// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

const migrations = [
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'gradcracker',
    source_job_id TEXT,
    job_url_direct TEXT,
    date_posted TEXT,
    job_type TEXT,
    salary_source TEXT,
    salary_interval TEXT,
    salary_min_amount REAL,
    salary_max_amount REAL,
    salary_currency TEXT,
    is_remote INTEGER,
    job_level TEXT,
    job_function TEXT,
    listing_type TEXT,
    emails TEXT,
    company_industry TEXT,
    company_logo TEXT,
    company_url_direct TEXT,
    company_addresses TEXT,
    company_num_employees TEXT,
    company_revenue TEXT,
    company_description TEXT,
    skills TEXT,
    experience_range TEXT,
    company_rating REAL,
    company_reviews_count INTEGER,
    vacancy_count INTEGER,
    work_from_home_type TEXT,
    title TEXT NOT NULL,
    employer TEXT NOT NULL,
    employer_url TEXT,
    job_url TEXT NOT NULL UNIQUE,
    application_link TEXT,
    disciplines TEXT,
    deadline TEXT,
    salary TEXT,
    location TEXT,
    degree_required TEXT,
    starting TEXT,
    job_description TEXT,
    status TEXT NOT NULL DEFAULT 'discovered' CHECK(status IN ('discovered', 'processing', 'ready', 'applied', 'skipped', 'expired')),
    suitability_score REAL,
    suitability_reason TEXT,
    tailored_summary TEXT,
    pdf_path TEXT,
    notion_page_id TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Rename settings key: webhookUrl -> pipelineWebhookUrl (safe to re-run)
  `INSERT OR REPLACE INTO settings(key, value, created_at, updated_at)
   SELECT 'pipelineWebhookUrl', value, created_at, updated_at FROM settings WHERE key = 'webhookUrl'`,
  `DELETE FROM settings WHERE key = 'webhookUrl'`,

  // Add source column for existing databases (safe to skip if already present)
  `ALTER TABLE jobs ADD COLUMN source TEXT NOT NULL DEFAULT 'gradcracker'`,
  `UPDATE jobs SET source = 'gradcracker' WHERE source IS NULL OR source = ''`,

  // Add JobSpy columns for existing databases (safe to skip if already present)
  `ALTER TABLE jobs ADD COLUMN source_job_id TEXT`,
  `ALTER TABLE jobs ADD COLUMN job_url_direct TEXT`,
  `ALTER TABLE jobs ADD COLUMN date_posted TEXT`,
  `ALTER TABLE jobs ADD COLUMN job_type TEXT`,
  `ALTER TABLE jobs ADD COLUMN salary_source TEXT`,
  `ALTER TABLE jobs ADD COLUMN salary_interval TEXT`,
  `ALTER TABLE jobs ADD COLUMN salary_min_amount REAL`,
  `ALTER TABLE jobs ADD COLUMN salary_max_amount REAL`,
  `ALTER TABLE jobs ADD COLUMN salary_currency TEXT`,
  `ALTER TABLE jobs ADD COLUMN is_remote INTEGER`,
  `ALTER TABLE jobs ADD COLUMN job_level TEXT`,
  `ALTER TABLE jobs ADD COLUMN job_function TEXT`,
  `ALTER TABLE jobs ADD COLUMN listing_type TEXT`,
  `ALTER TABLE jobs ADD COLUMN emails TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_industry TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_logo TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_url_direct TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_addresses TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_num_employees TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_revenue TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_description TEXT`,
  `ALTER TABLE jobs ADD COLUMN skills TEXT`,
  `ALTER TABLE jobs ADD COLUMN experience_range TEXT`,
  `ALTER TABLE jobs ADD COLUMN company_rating REAL`,
  `ALTER TABLE jobs ADD COLUMN company_reviews_count INTEGER`,
  `ALTER TABLE jobs ADD COLUMN vacancy_count INTEGER`,
  `ALTER TABLE jobs ADD COLUMN work_from_home_type TEXT`,
  `ALTER TABLE jobs ADD COLUMN selected_project_ids TEXT`,
  `ALTER TABLE jobs ADD COLUMN tailored_headline TEXT`,
  `ALTER TABLE jobs ADD COLUMN tailored_skills TEXT`,

  // Add sponsor match columns for visa sponsor matching feature
  `ALTER TABLE jobs ADD COLUMN sponsor_match_score REAL`,
  `ALTER TABLE jobs ADD COLUMN sponsor_match_names TEXT`,

  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_discovered_at ON jobs(discovered_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at)`,
];

console.log('🔧 Running database migrations...');

for (const migration of migrations) {
  try {
    sqlite.exec(migration);
    console.log('✅ Migration applied');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicateColumn =
      migration.toLowerCase().includes('alter table jobs add column') &&
      message.toLowerCase().includes('duplicate column name');

    if (isDuplicateColumn) {
      console.log('↩️ Migration skipped (column already exists)');
      continue;
    }

    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

sqlite.close();
console.log('🎉 Database migrations complete!');
