/**
 * Database migration script - creates tables if they don't exist.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "../config/dataDir";

// Database path - can be overridden via env for Docker
const DB_PATH = join(getDataDir(), "jobs.db");

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
    outcome TEXT,
    closed_at INTEGER,
    suitability_score REAL,
    suitability_reason TEXT,
    tailored_summary TEXT,
    pdf_path TEXT,
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
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
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

  `CREATE TABLE IF NOT EXISTS stage_events (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    group_id TEXT,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    metadata TEXT,
    outcome TEXT,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    due_date INTEGER,
    is_completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    duration_mins INTEGER,
    type TEXT NOT NULL,
    outcome TEXT,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_integrations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('gmail', 'imap')),
    account_key TEXT NOT NULL DEFAULT 'default',
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connected', 'error')),
    credentials TEXT,
    last_connected_at INTEGER,
    last_synced_at INTEGER,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, account_key)
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_sync_runs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('gmail', 'imap')),
    account_key TEXT NOT NULL DEFAULT 'default',
    integration_id TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    messages_discovered INTEGER NOT NULL DEFAULT 0,
    messages_relevant INTEGER NOT NULL DEFAULT 0,
    messages_classified INTEGER NOT NULL DEFAULT 0,
    messages_matched INTEGER NOT NULL DEFAULT 0,
    messages_approved INTEGER NOT NULL DEFAULT 0,
    messages_denied INTEGER NOT NULL DEFAULT 0,
    messages_errored INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (integration_id) REFERENCES post_application_integrations(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_messages (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('gmail', 'imap')),
    account_key TEXT NOT NULL DEFAULT 'default',
    integration_id TEXT,
    sync_run_id TEXT,
    external_message_id TEXT NOT NULL,
    external_thread_id TEXT,
    from_address TEXT NOT NULL DEFAULT '',
    from_domain TEXT,
    sender_name TEXT,
    subject TEXT NOT NULL DEFAULT '',
    received_at INTEGER NOT NULL,
    snippet TEXT NOT NULL DEFAULT '',
    classification_label TEXT,
    classification_confidence REAL,
    classification_payload TEXT,
    relevance_llm_score REAL,
    relevance_decision TEXT NOT NULL DEFAULT 'needs_llm' CHECK(relevance_decision IN ('relevant', 'not_relevant', 'needs_llm')),
    match_confidence INTEGER,
    message_type TEXT NOT NULL DEFAULT 'other' CHECK(message_type IN ('interview', 'rejection', 'offer', 'update', 'other')),
    stage_event_payload TEXT,
    processing_status TEXT NOT NULL DEFAULT 'pending_user' CHECK(processing_status IN ('auto_linked', 'pending_user', 'manual_linked', 'ignored')),
    matched_job_id TEXT,
    decided_at INTEGER,
    decided_by TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (integration_id) REFERENCES post_application_integrations(id) ON DELETE SET NULL,
    FOREIGN KEY (sync_run_id) REFERENCES post_application_sync_runs(id) ON DELETE SET NULL,
    FOREIGN KEY (matched_job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    UNIQUE(provider, account_key, external_message_id)
  )`,

  // Rename settings key: webhookUrl -> pipelineWebhookUrl (safe to re-run)
  `INSERT OR REPLACE INTO settings(key, value, created_at, updated_at)
   SELECT 'pipelineWebhookUrl', value, created_at, updated_at FROM settings WHERE key = 'webhookUrl'`,
  `DELETE FROM settings WHERE key = 'webhookUrl'`,
  // Drop legacy settings keys that are no longer read by the app.
  `DELETE FROM settings
   WHERE key IN (
     'jobspyHoursOld',
     'jobspySites',
     'jobspyLinkedinFetchDescription',
     'jobspyIsRemote',
     'openrouterApiKey'
   )`,

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

  // Add application tracking columns
  `ALTER TABLE jobs ADD COLUMN outcome TEXT`,
  `ALTER TABLE jobs ADD COLUMN closed_at INTEGER`,
  `ALTER TABLE stage_events ADD COLUMN outcome TEXT`,
  `ALTER TABLE stage_events ADD COLUMN title TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE stage_events ADD COLUMN group_id TEXT`,

  // Smart-router columns for existing databases.
  `ALTER TABLE post_application_messages ADD COLUMN match_confidence INTEGER`,
  `ALTER TABLE post_application_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'other' CHECK(message_type IN ('interview', 'rejection', 'offer', 'update', 'other'))`,
  `ALTER TABLE post_application_messages ADD COLUMN stage_event_payload TEXT`,
  `ALTER TABLE post_application_messages ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'pending_user' CHECK(processing_status IN ('auto_linked', 'pending_user', 'manual_linked', 'ignored'))`,
  `UPDATE post_application_messages
   SET match_confidence = CAST(round(COALESCE(relevance_llm_score, 0)) AS INTEGER)
   WHERE match_confidence IS NULL`,
  `UPDATE post_application_messages
   SET message_type = CASE
      WHEN lower(COALESCE(classification_label, '')) LIKE '%interview%' THEN 'interview'
      WHEN lower(COALESCE(classification_label, '')) LIKE '%offer%' THEN 'offer'
      WHEN lower(COALESCE(classification_label, '')) LIKE '%reject%' THEN 'rejection'
      WHEN lower(COALESCE(classification_label, '')) IN ('false positive', 'did not apply - inbound request') THEN 'other'
      ELSE 'update'
   END`,
  `UPDATE post_application_messages
   SET processing_status = CASE
      WHEN review_status = 'approved' THEN 'manual_linked'
      WHEN review_status IN ('pending_review', 'no_reliable_match') THEN 'pending_user'
      ELSE 'ignored'
   END`,
  `DROP TABLE IF EXISTS post_application_message_candidates`,
  `DROP TABLE IF EXISTS post_application_message_links`,

  // Ensure pipeline_runs status supports "cancelled" for existing databases.
  `CREATE TABLE IF NOT EXISTS pipeline_runs_new (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  )`,
  `INSERT OR REPLACE INTO pipeline_runs_new (id, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message)
   SELECT id, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message
   FROM pipeline_runs`,
  `DROP TABLE IF EXISTS pipeline_runs`,
  `ALTER TABLE pipeline_runs_new RENAME TO pipeline_runs`,

  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_discovered_at ON jobs(discovered_at)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status_discovered_at ON jobs(status, discovered_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stage_events_application_id ON stage_events(application_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stage_events_occurred_at ON stage_events(occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_application_id ON tasks(application_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews(application_id)`,
  `CREATE INDEX IF NOT EXISTS idx_post_app_sync_runs_provider_account_started_at ON post_application_sync_runs(provider, account_key, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_post_app_messages_provider_account_processing_status ON post_application_messages(provider, account_key, processing_status)`,

  // Backfill: Create "Applied" events for legacy jobs that have applied_at set but no event entry
  `INSERT INTO stage_events (id, application_id, title, from_stage, to_stage, occurred_at, metadata)
   SELECT
     'backfill-applied-' || id,
     id,
     'Applied',
     NULL,
     'applied',
     CAST(strftime('%s', applied_at) AS INTEGER),
     '{"eventLabel":"Applied","actor":"system"}'
   FROM jobs
   WHERE applied_at IS NOT NULL
     AND id NOT IN (SELECT application_id FROM stage_events WHERE to_stage = 'applied')`,
];

console.log("🔧 Running database migrations...");

for (const migration of migrations) {
  try {
    sqlite.exec(migration);
    console.log("✅ Migration applied");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicateColumn =
      (migration.toLowerCase().includes("alter table jobs add column") ||
        migration.toLowerCase().includes("alter table tasks add column") ||
        migration
          .toLowerCase()
          .includes("alter table post_application_messages add column") ||
        migration
          .toLowerCase()
          .includes("alter table stage_events add column")) &&
      message.toLowerCase().includes("duplicate column name");

    if (isDuplicateColumn) {
      console.log("↩️ Migration skipped (column already exists)");
      continue;
    }

    const isLegacyBackfillOnFreshSchema =
      migration.toLowerCase().includes("update post_application_messages") &&
      message.toLowerCase().includes("no such column");
    if (isLegacyBackfillOnFreshSchema) {
      console.log("↩️ Migration skipped (legacy backfill not applicable)");
      continue;
    }

    // Optional performance-only migration: if this fails we should still boot
    // existing databases and continue without the index.
    const isOptionalOptimizationMigration = migration.includes(
      "idx_jobs_status_discovered_at",
    );
    if (isOptionalOptimizationMigration) {
      console.warn("⚠️ Optional migration skipped:", message);
      continue;
    }

    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

sqlite.close();
console.log("🎉 Database migrations complete!");
