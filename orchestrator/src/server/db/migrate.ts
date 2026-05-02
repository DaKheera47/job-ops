/**
 * Database migration script - creates tables if they don't exist.
 */

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
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
const DEFAULT_TENANT_ID = "tenant_default";
const DEFAULT_TENANT_NAME = "JobOps";
const DEFAULT_TENANT_SLUG = "default";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function tableHasColumn(tableName: string, columnName: string): boolean {
  const columns = sqlite
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function tableExists(tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function addTenantColumn(tableName: string): void {
  if (!tableExists(tableName) || tableHasColumn(tableName, "tenant_id")) {
    return;
  }
  sqlite.exec(
    `ALTER TABLE ${tableName} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ${sqlString(DEFAULT_TENANT_ID)}`,
  );
}

function hashPasswordSync(password: string): {
  passwordHash: string;
  passwordSalt: string;
} {
  const passwordSalt = randomBytes(16).toString("base64url");
  const passwordHash = scryptSync(password, passwordSalt, 64).toString(
    "base64url",
  );
  return { passwordHash, passwordSalt };
}

const pipelineRunsHasConfigSnapshot = tableHasColumn(
  "pipeline_runs",
  "config_snapshot",
);
const pipelineRunsHasTenantId = tableHasColumn("pipeline_runs", "tenant_id");

const migrations = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `INSERT OR IGNORE INTO tenants(id, name, slug, created_at, updated_at)
   VALUES (${sqlString(DEFAULT_TENANT_ID)}, ${sqlString(DEFAULT_TENANT_NAME)}, ${sqlString(DEFAULT_TENANT_SLUG)}, datetime('now'), datetime('now'))`,

  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_system_admin INTEGER NOT NULL DEFAULT 0,
    is_disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS tenant_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner', 'member')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(user_id, tenant_id)
  )`,

  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
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
    job_url TEXT NOT NULL,
    application_link TEXT,
    disciplines TEXT,
    deadline TEXT,
    salary TEXT,
    location TEXT,
    location_evidence TEXT,
    degree_required TEXT,
    starting TEXT,
    job_description TEXT,
    status TEXT NOT NULL DEFAULT 'discovered' CHECK(status IN ('discovered', 'processing', 'ready', 'applied', 'in_progress', 'skipped', 'expired')),
    outcome TEXT,
    closed_at INTEGER,
    suitability_score REAL,
    suitability_reason TEXT,
    tailored_summary TEXT,
    tailored_headline TEXT,
    tailored_skills TEXT,
    selected_project_ids TEXT,
    pdf_path TEXT,
    tracer_links_enabled INTEGER NOT NULL DEFAULT 0,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    ready_at TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    config_snapshot TEXT,
    requested_config TEXT,
    effective_config TEXT,
    result_summary TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS analytics_install_state (
    id TEXT PRIMARY KEY,
    distinct_id TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    raw_event_replay_version INTEGER NOT NULL DEFAULT 0,
    raw_event_replay_completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS analytics_server_event_replays (
    event_key TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    claimed_at INTEGER,
    reported_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_analytics_server_event_replays_event_name
    ON analytics_server_event_replays(event_name)`,

  `CREATE INDEX IF NOT EXISTS idx_analytics_server_event_replays_occurred_at
    ON analytics_server_event_replays(occurred_at)`,

  `CREATE TABLE IF NOT EXISTS analytics_milestones (
    milestone TEXT PRIMARY KEY,
    first_seen_at INTEGER NOT NULL,
    first_session_id TEXT,
    reported_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_analytics_milestones_first_seen_at
    ON analytics_milestones(first_seen_at)`,

  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    user_id TEXT,
    tenant_id TEXT,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
    ON auth_sessions(expires_at)`,

  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at
    ON auth_sessions(revoked_at)`,

  `CREATE TABLE IF NOT EXISTS design_resume_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    title TEXT NOT NULL,
    resume_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    source_resume_id TEXT,
    source_mode TEXT CHECK(source_mode IN ('v4', 'v5')),
    imported_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS design_resume_assets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    document_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'picture' CHECK(kind IN ('picture')),
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES design_resume_documents(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_design_resume_assets_document_id
    ON design_resume_assets(document_id)`,

  `CREATE TABLE IF NOT EXISTS job_chat_threads (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    job_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at TEXT,
    active_root_message_id TEXT,
    selected_note_ids TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS job_chat_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    thread_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'partial' CHECK(status IN ('complete', 'partial', 'cancelled', 'failed')),
    tokens_in INTEGER,
    tokens_out INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    replaces_message_id TEXT,
    parent_message_id TEXT,
    active_child_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (thread_id) REFERENCES job_chat_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS job_chat_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    thread_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled', 'failed')),
    model TEXT,
    provider TEXT,
    error_code TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    request_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (thread_id) REFERENCES job_chat_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS stage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    application_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    group_id TEXT,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    metadata TEXT,
    outcome TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    application_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    due_date INTEGER,
    is_completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_job_notes_job_updated
    ON job_notes(job_id, updated_at)`,

  `CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    application_id TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    duration_mins INTEGER,
    type TEXT NOT NULL,
    outcome TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_integrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
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
    UNIQUE(tenant_id, provider, account_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_sync_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (integration_id) REFERENCES post_application_integrations(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS post_application_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (integration_id) REFERENCES post_application_integrations(id) ON DELETE SET NULL,
    FOREIGN KEY (sync_run_id) REFERENCES post_application_sync_runs(id) ON DELETE SET NULL,
    FOREIGN KEY (matched_job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, provider, account_key, external_message_id)
  )`,

  `CREATE TABLE IF NOT EXISTS tracer_links (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    token TEXT NOT NULL UNIQUE,
    job_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_label TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    destination_url_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, job_id, source_path, destination_url_hash)
  )`,

  `CREATE TABLE IF NOT EXISTS tracer_click_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    tracer_link_id TEXT NOT NULL,
    clicked_at INTEGER NOT NULL,
    request_id TEXT,
    is_likely_bot INTEGER NOT NULL DEFAULT 0,
    device_type TEXT NOT NULL DEFAULT 'unknown',
    ua_family TEXT NOT NULL DEFAULT 'unknown',
    os_family TEXT NOT NULL DEFAULT 'unknown',
    referrer_host TEXT,
    ip_hash TEXT,
    unique_fingerprint_hash TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (tracer_link_id) REFERENCES tracer_links(id) ON DELETE CASCADE
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
  `ALTER TABLE jobs ADD COLUMN location_evidence TEXT`,
  `ALTER TABLE jobs ADD COLUMN selected_project_ids TEXT`,
  `ALTER TABLE jobs ADD COLUMN tailored_headline TEXT`,
  `ALTER TABLE jobs ADD COLUMN tailored_skills TEXT`,
  `ALTER TABLE jobs ADD COLUMN tracer_links_enabled INTEGER NOT NULL DEFAULT 0`,

  // Add sponsor match columns for visa sponsor matching feature
  `ALTER TABLE jobs ADD COLUMN sponsor_match_score REAL`,
  `ALTER TABLE jobs ADD COLUMN sponsor_match_names TEXT`,

  // Add application tracking columns
  `ALTER TABLE jobs ADD COLUMN outcome TEXT`,
  `ALTER TABLE jobs ADD COLUMN closed_at INTEGER`,
  `ALTER TABLE jobs ADD COLUMN ready_at TEXT`,
  `ALTER TABLE stage_events ADD COLUMN outcome TEXT`,
  `ALTER TABLE stage_events ADD COLUMN title TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE stage_events ADD COLUMN group_id TEXT`,
  `UPDATE jobs
   SET ready_at = COALESCE(ready_at, updated_at)
   WHERE status = 'ready' AND ready_at IS NULL`,

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

  // Protect child tables (stage_events/tasks/interviews) during parent table rebuilds.
  // Without this, dropping/replacing `jobs` can cascade-delete historical stage data.
  `PRAGMA foreign_keys = OFF`,

  // Ensure pipeline_runs status supports "cancelled" for existing databases.
  `CREATE TABLE IF NOT EXISTS pipeline_runs_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    config_snapshot TEXT,
    requested_config TEXT,
    effective_config TEXT,
    result_summary TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,
  pipelineRunsHasConfigSnapshot
    ? `INSERT OR REPLACE INTO pipeline_runs_new (id, tenant_id, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message, config_snapshot, requested_config, effective_config, result_summary)
   SELECT id, ${pipelineRunsHasTenantId ? `COALESCE(tenant_id, ${sqlString(DEFAULT_TENANT_ID)})` : sqlString(DEFAULT_TENANT_ID)}, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message, config_snapshot, NULL, NULL, NULL
   FROM pipeline_runs`
    : `INSERT OR REPLACE INTO pipeline_runs_new (id, tenant_id, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message, config_snapshot, requested_config, effective_config, result_summary)
   SELECT id, ${sqlString(DEFAULT_TENANT_ID)}, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message, NULL, NULL, NULL, NULL
   FROM pipeline_runs`,
  `DROP TABLE IF EXISTS pipeline_runs`,
  `ALTER TABLE pipeline_runs_new RENAME TO pipeline_runs`,

  // Ensure jobs status supports "in_progress" for existing databases.
  `CREATE TABLE IF NOT EXISTS jobs_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
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
    job_url TEXT NOT NULL,
    application_link TEXT,
    disciplines TEXT,
    deadline TEXT,
    salary TEXT,
    location TEXT,
    location_evidence TEXT,
    degree_required TEXT,
    starting TEXT,
    job_description TEXT,
    status TEXT NOT NULL DEFAULT 'discovered' CHECK(status IN ('discovered', 'processing', 'ready', 'applied', 'in_progress', 'skipped', 'expired')),
    outcome TEXT,
    closed_at INTEGER,
    suitability_score REAL,
    suitability_reason TEXT,
    tailored_summary TEXT,
    tailored_headline TEXT,
    tailored_skills TEXT,
    selected_project_ids TEXT,
    pdf_path TEXT,
    tracer_links_enabled INTEGER NOT NULL DEFAULT 0,
    sponsor_match_score REAL,
    sponsor_match_names TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    ready_at TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,
  `INSERT OR REPLACE INTO jobs_new (
    id, tenant_id, source, source_job_id, job_url_direct, date_posted, job_type, salary_source, salary_interval,
    salary_min_amount, salary_max_amount, salary_currency, is_remote, job_level, job_function, listing_type,
    emails, company_industry, company_logo, company_url_direct, company_addresses, company_num_employees,
    company_revenue, company_description, skills, experience_range, company_rating, company_reviews_count,
    vacancy_count, work_from_home_type, title, employer, employer_url, job_url, application_link, disciplines,
    deadline, salary, location, location_evidence, degree_required, starting, job_description, status, outcome, closed_at,
    suitability_score, suitability_reason, tailored_summary, tailored_headline, tailored_skills,
    selected_project_ids, pdf_path, tracer_links_enabled, sponsor_match_score, sponsor_match_names, discovered_at, processed_at,
    ready_at,
    applied_at, created_at, updated_at
  )
  SELECT
    id, ${tableHasColumn("jobs", "tenant_id") ? `COALESCE(tenant_id, ${sqlString(DEFAULT_TENANT_ID)})` : sqlString(DEFAULT_TENANT_ID)}, source, source_job_id, job_url_direct, date_posted, job_type, salary_source, salary_interval,
    salary_min_amount, salary_max_amount, salary_currency, is_remote, job_level, job_function, listing_type,
    emails, company_industry, company_logo, company_url_direct, company_addresses, company_num_employees,
    company_revenue, company_description, skills, experience_range, company_rating, company_reviews_count,
    vacancy_count, work_from_home_type, title, employer, employer_url, job_url, application_link, disciplines,
    deadline, salary, location, location_evidence, degree_required, starting, job_description, status, outcome, closed_at,
    suitability_score, suitability_reason, tailored_summary, tailored_headline, tailored_skills,
    selected_project_ids, pdf_path, tracer_links_enabled, sponsor_match_score, sponsor_match_names, discovered_at, processed_at,
    ready_at,
    applied_at, created_at, updated_at
  FROM jobs`,
  `DROP TABLE IF EXISTS jobs`,
  `ALTER TABLE jobs_new RENAME TO jobs`,
  `PRAGMA foreign_keys = ON`,

  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_tenant_job_url_unique ON jobs(tenant_id, job_url)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status)`,
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
  `CREATE INDEX IF NOT EXISTS idx_job_chat_threads_job_updated ON job_chat_threads(job_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_job_chat_messages_thread_created ON job_chat_messages(thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_job_chat_runs_thread_status ON job_chat_runs(thread_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_links_token ON tracer_links(token)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_links_job_id ON tracer_links(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_click_events_tracer_link_id ON tracer_click_events(tracer_link_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_click_events_clicked_at ON tracer_click_events(clicked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_click_events_is_likely_bot ON tracer_click_events(is_likely_bot)`,
  `CREATE INDEX IF NOT EXISTS idx_tracer_click_events_unique_fingerprint_hash ON tracer_click_events(unique_fingerprint_hash)`,
  // Ensure only one running run per thread; backfill any duplicates first.
  `WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY started_at DESC, id DESC) AS rank_in_thread
      FROM job_chat_runs
      WHERE status = 'running'
    )
    UPDATE job_chat_runs
    SET
      status = 'failed',
      error_code = COALESCE(error_code, 'CONFLICT'),
      error_message = COALESCE(error_message, 'Recovered duplicate running run during migration'),
      completed_at = COALESCE(completed_at, CAST(strftime('%s', 'now') AS INTEGER)),
      updated_at = datetime('now')
    WHERE id IN (SELECT id FROM ranked WHERE rank_in_thread > 1)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_job_chat_runs_thread_running_unique
   ON job_chat_runs(thread_id)
   WHERE status = 'running'`,

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

  // Backfill: Create "Closed" events for legacy jobs already closed via outcome.
  `INSERT INTO stage_events (id, application_id, title, from_stage, to_stage, occurred_at, metadata, outcome)
   SELECT
     'backfill-closed-' || jobs.id,
     jobs.id,
     'Closed',
     (
       SELECT se.to_stage
       FROM stage_events se
       WHERE se.application_id = jobs.id
       ORDER BY se.occurred_at DESC, se.id DESC
       LIMIT 1
     ),
     'closed',
     COALESCE(
       jobs.closed_at,
       CAST(strftime('%s', jobs.applied_at) AS INTEGER),
       CAST(strftime('%s', jobs.updated_at) AS INTEGER),
       CAST(strftime('%s', jobs.discovered_at) AS INTEGER),
       CAST(strftime('%s', 'now') AS INTEGER)
     ),
     '{"eventLabel":"Closed","actor":"system"}',
     jobs.outcome
   FROM jobs
   WHERE jobs.outcome IS NOT NULL
     AND jobs.id NOT IN (SELECT application_id FROM stage_events WHERE to_stage = 'closed')`,

  // Backfill: Sync legacy workflow status from latest stage event.
  `UPDATE jobs
   SET
     status = 'in_progress',
     updated_at = datetime('now')
   WHERE status = 'applied'
     AND COALESCE((
       SELECT se.to_stage
       FROM stage_events se
       WHERE se.application_id = jobs.id
       ORDER BY se.occurred_at DESC, se.id DESC
       LIMIT 1
     ), 'applied') IN (
       'recruiter_screen',
       'assessment',
       'hiring_manager_screen',
       'technical_interview',
       'onsite',
       'offer',
       'closed'
     )`,

  // Branching conversations: add parent_message_id and active_child_id to job_chat_messages
  `ALTER TABLE job_chat_messages ADD COLUMN parent_message_id TEXT`,
  `ALTER TABLE job_chat_messages ADD COLUMN active_child_id TEXT`,
  `ALTER TABLE job_chat_threads ADD COLUMN active_root_message_id TEXT`,
  `ALTER TABLE job_chat_threads ADD COLUMN selected_note_ids TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE pipeline_runs ADD COLUMN config_snapshot TEXT`,
  `ALTER TABLE analytics_install_state ADD COLUMN raw_event_replay_version INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE analytics_install_state ADD COLUMN raw_event_replay_completed_at TEXT`,

  // Backfill: link existing messages into a linear chain (each message's parent = its predecessor)
  `UPDATE job_chat_messages
   SET parent_message_id = (
     SELECT prev.id
     FROM job_chat_messages prev
     WHERE prev.thread_id = job_chat_messages.thread_id
       AND prev.created_at < job_chat_messages.created_at
     ORDER BY prev.created_at DESC
     LIMIT 1
   )
   WHERE parent_message_id IS NULL`,

  // Backfill: for regenerated messages, re-link as siblings (same parent as the message they replaced)
  `UPDATE job_chat_messages
   SET parent_message_id = (
     SELECT orig.parent_message_id
     FROM job_chat_messages orig
     WHERE orig.id = job_chat_messages.replaces_message_id
   )
   WHERE replaces_message_id IS NOT NULL`,

  // Backfill: set active_child_id on every parent to its newest child
  `UPDATE job_chat_messages
   SET active_child_id = (
     SELECT child.id
     FROM job_chat_messages child
     WHERE child.parent_message_id = job_chat_messages.id
     ORDER BY child.created_at DESC
     LIMIT 1
   )
   WHERE id IN (SELECT DISTINCT parent_message_id FROM job_chat_messages WHERE parent_message_id IS NOT NULL)`,

  `CREATE INDEX IF NOT EXISTS idx_job_chat_messages_parent ON job_chat_messages(parent_message_id)`,

  // Backfill: Mark closed applications from latest stage event.
  `UPDATE jobs
   SET
     status = 'in_progress',
     closed_at = (
       SELECT se.occurred_at
       FROM stage_events se
       WHERE se.application_id = jobs.id
       ORDER BY se.occurred_at DESC, se.id DESC
       LIMIT 1
     ),
     outcome = COALESCE((
       SELECT se.outcome
       FROM stage_events se
       WHERE se.application_id = jobs.id
       ORDER BY se.occurred_at DESC, se.id DESC
       LIMIT 1
     ), outcome),
     updated_at = datetime('now')
   WHERE status IN ('applied', 'in_progress')
     AND COALESCE((
       SELECT se.to_stage
       FROM stage_events se
       WHERE se.application_id = jobs.id
       ORDER BY se.occurred_at DESC, se.id DESC
       LIMIT 1
     ), 'applied') = 'closed'`,
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
        migration
          .toLowerCase()
          .includes("alter table pipeline_runs add column") ||
        migration.toLowerCase().includes("alter table tasks add column") ||
        migration
          .toLowerCase()
          .includes("alter table pipeline_runs add column") ||
        migration
          .toLowerCase()
          .includes("alter table post_application_messages add column") ||
        migration
          .toLowerCase()
          .includes("alter table stage_events add column") ||
        migration
          .toLowerCase()
          .includes("alter table job_chat_messages add column") ||
        migration
          .toLowerCase()
          .includes("alter table job_chat_threads add column") ||
        migration
          .toLowerCase()
          .includes("alter table analytics_install_state add column")) &&
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

function ensureTenantColumns(): void {
  for (const tableName of [
    "stage_events",
    "tasks",
    "job_notes",
    "interviews",
    "job_chat_threads",
    "job_chat_messages",
    "job_chat_runs",
    "design_resume_documents",
    "design_resume_assets",
    "post_application_integrations",
    "post_application_sync_runs",
    "post_application_messages",
    "tracer_links",
    "tracer_click_events",
    "auth_sessions",
  ]) {
    addTenantColumn(tableName);
  }

  if (
    tableExists("auth_sessions") &&
    !tableHasColumn("auth_sessions", "user_id")
  ) {
    sqlite.exec("ALTER TABLE auth_sessions ADD COLUMN user_id TEXT");
  }
}

function rebuildSettingsTable(): void {
  if (!tableExists("settings")) return;

  sqlite.exec(`CREATE TABLE IF NOT EXISTS settings_new (
    tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`);

  const hasTenantId = tableHasColumn("settings", "tenant_id");
  sqlite.exec(`INSERT OR REPLACE INTO settings_new(tenant_id, key, value, created_at, updated_at)
    SELECT ${hasTenantId ? `COALESCE(tenant_id, ${sqlString(DEFAULT_TENANT_ID)})` : sqlString(DEFAULT_TENANT_ID)}, key, value, created_at, updated_at
    FROM settings`);
  sqlite.exec("DROP TABLE IF EXISTS settings");
  sqlite.exec("ALTER TABLE settings_new RENAME TO settings");
}

function seedLegacyOwnerFromBasicAuth(): void {
  const existing = sqlite
    .prepare("SELECT count(*) AS count FROM users")
    .get() as { count: number };
  if (existing.count > 0) return;

  const rawUsername = (process.env.BASIC_AUTH_USER || "").trim();
  const username = rawUsername.toLowerCase();
  const password = (process.env.BASIC_AUTH_PASSWORD || "").trim();
  if (!username || !password) return;

  const now = new Date().toISOString();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const { passwordHash, passwordSalt } = hashPasswordSync(password);

  sqlite
    .prepare(
      `INSERT INTO users(id, username, display_name, password_hash, password_salt, is_system_admin, is_disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    )
    .run(
      userId,
      username,
      rawUsername || username,
      passwordHash,
      passwordSalt,
      now,
      now,
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO tenant_memberships(id, user_id, tenant_id, role, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', ?, ?)`,
    )
    .run(membershipId, userId, DEFAULT_TENANT_ID, now, now);

  sqlite.exec("DELETE FROM auth_sessions");
}

console.log("🔐 Applying tenancy compatibility migrations...");
ensureTenantColumns();
rebuildSettingsTable();
sqlite.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_tenant_key_unique ON settings(tenant_id, key)",
);
sqlite.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_tenant_job_url_unique ON jobs(tenant_id, job_url)",
);
sqlite.exec(
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)",
);
seedLegacyOwnerFromBasicAuth();

sqlite.close();
console.log("🎉 Database migrations complete!");
