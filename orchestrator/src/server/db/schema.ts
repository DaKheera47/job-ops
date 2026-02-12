/**
 * Database schema using Drizzle ORM with SQLite.
 */

import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  APPLICATION_TASK_TYPES,
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  POST_APPLICATION_INTEGRATION_STATUSES,
  POST_APPLICATION_MESSAGE_TYPES,
  POST_APPLICATION_PROCESSING_STATUSES,
  POST_APPLICATION_PROVIDERS,
  POST_APPLICATION_RELEVANCE_DECISIONS,
  POST_APPLICATION_SYNC_RUN_STATUSES,
} from "@shared/types";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),

  // From crawler
  source: text("source", {
    enum: [
      "gradcracker",
      "indeed",
      "linkedin",
      "glassdoor",
      "ukvisajobs",
      "manual",
    ],
  })
    .notNull()
    .default("gradcracker"),
  sourceJobId: text("source_job_id"),
  jobUrlDirect: text("job_url_direct"),
  datePosted: text("date_posted"),
  title: text("title").notNull(),
  employer: text("employer").notNull(),
  employerUrl: text("employer_url"),
  jobUrl: text("job_url").notNull().unique(),
  applicationLink: text("application_link"),
  disciplines: text("disciplines"),
  deadline: text("deadline"),
  salary: text("salary"),
  location: text("location"),
  degreeRequired: text("degree_required"),
  starting: text("starting"),
  jobDescription: text("job_description"),

  // JobSpy fields (nullable for other sources)
  jobType: text("job_type"),
  salarySource: text("salary_source"),
  salaryInterval: text("salary_interval"),
  salaryMinAmount: real("salary_min_amount"),
  salaryMaxAmount: real("salary_max_amount"),
  salaryCurrency: text("salary_currency"),
  isRemote: integer("is_remote", { mode: "boolean" }),
  jobLevel: text("job_level"),
  jobFunction: text("job_function"),
  listingType: text("listing_type"),
  emails: text("emails"),
  companyIndustry: text("company_industry"),
  companyLogo: text("company_logo"),
  companyUrlDirect: text("company_url_direct"),
  companyAddresses: text("company_addresses"),
  companyNumEmployees: text("company_num_employees"),
  companyRevenue: text("company_revenue"),
  companyDescription: text("company_description"),
  skills: text("skills"),
  experienceRange: text("experience_range"),
  companyRating: real("company_rating"),
  companyReviewsCount: integer("company_reviews_count"),
  vacancyCount: integer("vacancy_count"),
  workFromHomeType: text("work_from_home_type"),

  // Orchestrator enrichments
  status: text("status", {
    enum: [
      "discovered",
      "processing",
      "ready",
      "applied",
      "skipped",
      "expired",
    ],
  })
    .notNull()
    .default("discovered"),
  outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
  closedAt: integer("closed_at", { mode: "number" }),
  suitabilityScore: real("suitability_score"),
  suitabilityReason: text("suitability_reason"),
  tailoredSummary: text("tailored_summary"),
  tailoredHeadline: text("tailored_headline"),
  tailoredSkills: text("tailored_skills"),
  selectedProjectIds: text("selected_project_ids"),
  pdfPath: text("pdf_path"),
  sponsorMatchScore: real("sponsor_match_score"),
  sponsorMatchNames: text("sponsor_match_names"),

  // Timestamps
  discoveredAt: text("discovered_at").notNull().default(sql`(datetime('now'))`),
  processedAt: text("processed_at"),
  appliedAt: text("applied_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const stageEvents = sqliteTable("stage_events", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  groupId: text("group_id"),
  fromStage: text("from_stage", { enum: APPLICATION_STAGES }),
  toStage: text("to_stage", { enum: APPLICATION_STAGES }).notNull(),
  occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
  metadata: text("metadata", { mode: "json" }),
  outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type", { enum: APPLICATION_TASK_TYPES }).notNull(),
  title: text("title").notNull(),
  dueDate: integer("due_date", { mode: "number" }),
  isCompleted: integer("is_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
});

export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  scheduledAt: integer("scheduled_at", { mode: "number" }).notNull(),
  durationMins: integer("duration_mins"),
  type: text("type", { enum: INTERVIEW_TYPES }).notNull(),
  outcome: text("outcome", { enum: INTERVIEW_OUTCOMES }),
});

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  status: text("status", {
    enum: ["running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("running"),
  jobsDiscovered: integer("jobs_discovered").notNull().default(0),
  jobsProcessed: integer("jobs_processed").notNull().default(0),
  errorMessage: text("error_message"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const postApplicationIntegrations = sqliteTable(
  "post_application_integrations",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    displayName: text("display_name"),
    status: text("status", { enum: POST_APPLICATION_INTEGRATION_STATUSES })
      .notNull()
      .default("disconnected"),
    credentials: text("credentials", { mode: "json" }),
    lastConnectedAt: integer("last_connected_at", { mode: "number" }),
    lastSyncedAt: integer("last_synced_at", { mode: "number" }),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex(
      "idx_post_app_integrations_provider_account_unique",
    ).on(table.provider, table.accountKey),
  }),
);

export const postApplicationSyncRuns = sqliteTable(
  "post_application_sync_runs",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    status: text("status", { enum: POST_APPLICATION_SYNC_RUN_STATUSES })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
    messagesDiscovered: integer("messages_discovered").notNull().default(0),
    messagesRelevant: integer("messages_relevant").notNull().default(0),
    messagesClassified: integer("messages_classified").notNull().default(0),
    messagesMatched: integer("messages_matched").notNull().default(0),
    messagesApproved: integer("messages_approved").notNull().default(0),
    messagesDenied: integer("messages_denied").notNull().default(0),
    messagesErrored: integer("messages_errored").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountStartedAtIndex: index(
      "idx_post_app_sync_runs_provider_account_started_at",
    ).on(table.provider, table.accountKey, table.startedAt),
  }),
);

export const postApplicationMessages = sqliteTable(
  "post_application_messages",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    syncRunId: text("sync_run_id").references(
      () => postApplicationSyncRuns.id,
      {
        onDelete: "set null",
      },
    ),
    externalMessageId: text("external_message_id").notNull(),
    externalThreadId: text("external_thread_id"),
    fromAddress: text("from_address").notNull().default(""),
    fromDomain: text("from_domain"),
    senderName: text("sender_name"),
    subject: text("subject").notNull().default(""),
    receivedAt: integer("received_at", { mode: "number" }).notNull(),
    snippet: text("snippet").notNull().default(""),
    classificationLabel: text("classification_label"),
    classificationConfidence: real("classification_confidence"),
    classificationPayload: text("classification_payload", { mode: "json" }),
    relevanceLlmScore: real("relevance_llm_score"),
    relevanceDecision: text("relevance_decision", {
      enum: POST_APPLICATION_RELEVANCE_DECISIONS,
    })
      .notNull()
      .default("needs_llm"),
    matchConfidence: integer("match_confidence"),
    messageType: text("message_type", {
      enum: POST_APPLICATION_MESSAGE_TYPES,
    })
      .notNull()
      .default("other"),
    stageEventPayload: text("stage_event_payload", { mode: "json" }),
    processingStatus: text("processing_status", {
      enum: POST_APPLICATION_PROCESSING_STATUSES,
    })
      .notNull()
      .default("pending_user"),
    matchedJobId: text("matched_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decided_at", { mode: "number" }),
    decidedBy: text("decided_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountExternalMessageUnique: uniqueIndex(
      "idx_post_app_messages_provider_account_external_unique",
    ).on(table.provider, table.accountKey, table.externalMessageId),
    providerAccountReviewStatusIndex: index(
      "idx_post_app_messages_provider_account_processing_status",
    ).on(table.provider, table.accountKey, table.processingStatus),
  }),
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type StageEventRow = typeof stageEvents.$inferSelect;
export type NewStageEventRow = typeof stageEvents.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type InterviewRow = typeof interviews.$inferSelect;
export type NewInterviewRow = typeof interviews.$inferInsert;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type NewPipelineRunRow = typeof pipelineRuns.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
export type PostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferSelect;
export type NewPostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferInsert;
export type PostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferSelect;
export type NewPostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferInsert;
export type PostApplicationMessageRow =
  typeof postApplicationMessages.$inferSelect;
export type NewPostApplicationMessageRow =
  typeof postApplicationMessages.$inferInsert;
