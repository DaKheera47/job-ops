/**
 * Job repository - data access layer for jobs.
 */

import { randomUUID } from "node:crypto";
import type {
  CreateJobInput,
  Job,
  JobListItem,
  JobStatus,
  JobsRevisionResponse,
  UpdateJobInput,
} from "@shared/types";
import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "../db/index";

const { jobs } = schema;

function normalizeStatusFilter(statuses?: JobStatus[]): string | null {
  if (!statuses || statuses.length === 0) return null;
  return Array.from(new Set(statuses)).sort().join(",");
}

/**
 * Get all jobs, optionally filtered by status.
 */
export async function getAllJobs(statuses?: JobStatus[]): Promise<Job[]> {
  const query =
    statuses && statuses.length > 0
      ? db
          .select()
          .from(jobs)
          .where(inArray(jobs.status, statuses))
          .orderBy(desc(jobs.discoveredAt))
      : db.select().from(jobs).orderBy(desc(jobs.discoveredAt));

  const rows = await query;
  return rows.map(mapRowToJob);
}

/**
 * Get lightweight list items for jobs, optionally filtered by status.
 */
export async function getJobListItems(
  statuses?: JobStatus[],
): Promise<JobListItem[]> {
  const selection = {
    id: jobs.id,
    source: jobs.source,
    title: jobs.title,
    employer: jobs.employer,
    jobUrl: jobs.jobUrl,
    applicationLink: jobs.applicationLink,
    datePosted: jobs.datePosted,
    deadline: jobs.deadline,
    salary: jobs.salary,
    location: jobs.location,
    status: jobs.status,
    suitabilityScore: jobs.suitabilityScore,
    sponsorMatchScore: jobs.sponsorMatchScore,
    jobType: jobs.jobType,
    jobFunction: jobs.jobFunction,
    salaryMinAmount: jobs.salaryMinAmount,
    salaryMaxAmount: jobs.salaryMaxAmount,
    salaryCurrency: jobs.salaryCurrency,
    discoveredAt: jobs.discoveredAt,
    appliedAt: jobs.appliedAt,
    updatedAt: jobs.updatedAt,
  } as const;

  const query =
    statuses && statuses.length > 0
      ? db
          .select(selection)
          .from(jobs)
          .where(inArray(jobs.status, statuses))
          .orderBy(desc(jobs.discoveredAt))
      : db.select(selection).from(jobs).orderBy(desc(jobs.discoveredAt));

  const rows = await query;
  return rows.map((row) => ({
    ...row,
    source: row.source as JobListItem["source"],
    status: row.status as JobStatus,
  }));
}

/**
 * Get a lightweight revision token for jobs list invalidation.
 */
export async function getJobsRevision(
  statuses?: JobStatus[],
): Promise<JobsRevisionResponse> {
  const statusFilter = normalizeStatusFilter(statuses);
  const whereClause =
    statuses && statuses.length > 0
      ? inArray(jobs.status, statuses)
      : undefined;

  const baseQuery = db
    .select({
      latestUpdatedAt: sql<string | null>`max(${jobs.updatedAt})`,
      total: sql<number>`count(*)`,
    })
    .from(jobs);
  const [row] = whereClause
    ? await baseQuery.where(whereClause)
    : await baseQuery;

  const latestUpdatedAt = row?.latestUpdatedAt ?? null;
  const total = row?.total ?? 0;
  const revision = `${latestUpdatedAt ?? "none"}:${total}:${statusFilter ?? "all"}`;

  return {
    revision,
    latestUpdatedAt,
    total,
    statusFilter,
  };
}

/**
 * Get a single job by ID.
 */
export async function getJobById(id: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  return row ? mapRowToJob(row) : null;
}

export async function listJobSummariesByIds(jobIds: string[]): Promise<
  Array<{
    id: string;
    title: string;
    employer: string;
  }>
> {
  if (jobIds.length === 0) return [];

  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      employer: jobs.employer,
    })
    .from(jobs)
    .where(inArray(jobs.id, jobIds));
}

/**
 * Get a job by its URL (for deduplication).
 */
export async function getJobByUrl(jobUrl: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.jobUrl, jobUrl));
  return row ? mapRowToJob(row) : null;
}

/**
 * Get all known job URLs (for deduplication / crawler optimizations).
 */
export async function getAllJobUrls(): Promise<string[]> {
  const rows = await db.select({ jobUrl: jobs.jobUrl }).from(jobs);
  return rows.map((r) => r.jobUrl);
}

/**
 * Create a new job (or return existing if URL matches).
 */
export async function createJob(input: CreateJobInput): Promise<Job> {
  // Check for existing job with same URL
  const existing = await getJobByUrl(input.jobUrl);
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(jobs).values({
    id,
    source: input.source,
    sourceJobId: input.sourceJobId ?? null,
    jobUrlDirect: input.jobUrlDirect ?? null,
    datePosted: input.datePosted ?? null,
    title: input.title,
    employer: input.employer,
    employerUrl: input.employerUrl ?? null,
    jobUrl: input.jobUrl,
    applicationLink: input.applicationLink ?? null,
    disciplines: input.disciplines ?? null,
    deadline: input.deadline ?? null,
    salary: input.salary ?? null,
    location: input.location ?? null,
    degreeRequired: input.degreeRequired ?? null,
    starting: input.starting ?? null,
    jobDescription: input.jobDescription ?? null,
    jobType: input.jobType ?? null,
    salarySource: input.salarySource ?? null,
    salaryInterval: input.salaryInterval ?? null,
    salaryMinAmount: input.salaryMinAmount ?? null,
    salaryMaxAmount: input.salaryMaxAmount ?? null,
    salaryCurrency: input.salaryCurrency ?? null,
    isRemote: input.isRemote ?? null,
    jobLevel: input.jobLevel ?? null,
    jobFunction: input.jobFunction ?? null,
    listingType: input.listingType ?? null,
    emails: input.emails ?? null,
    companyIndustry: input.companyIndustry ?? null,
    companyLogo: input.companyLogo ?? null,
    companyUrlDirect: input.companyUrlDirect ?? null,
    companyAddresses: input.companyAddresses ?? null,
    companyNumEmployees: input.companyNumEmployees ?? null,
    companyRevenue: input.companyRevenue ?? null,
    companyDescription: input.companyDescription ?? null,
    skills: input.skills ?? null,
    experienceRange: input.experienceRange ?? null,
    companyRating: input.companyRating ?? null,
    companyReviewsCount: input.companyReviewsCount ?? null,
    vacancyCount: input.vacancyCount ?? null,
    workFromHomeType: input.workFromHomeType ?? null,
    status: "discovered",
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const job = await getJobById(id);
  if (!job) {
    throw new Error(`Failed to retrieve newly created job with ID ${id}`);
  }
  return job;
}

/**
 * Update a job.
 */
export async function updateJob(
  id: string,
  input: UpdateJobInput,
): Promise<Job | null> {
  const now = new Date().toISOString();

  await db
    .update(jobs)
    .set({
      ...input,
      updatedAt: now,
      ...(input.status === "processing" ? { processedAt: now } : {}),
      ...(input.status === "applied" && !input.appliedAt
        ? { appliedAt: now }
        : {}),
    })
    .where(eq(jobs.id, id));

  return getJobById(id);
}

/**
 * Bulk create jobs from crawler results.
 */
export async function bulkCreateJobs(
  inputs: CreateJobInput[],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const input of inputs) {
    const existing = await getJobByUrl(input.jobUrl);
    if (existing) {
      skipped++;
      continue;
    }

    await createJob(input);
    created++;
  }

  return { created, skipped };
}

/**
 * Get job statistics by status.
 */
export async function getJobStats(): Promise<Record<JobStatus, number>> {
  const result = await db
    .select({
      status: jobs.status,
      count: sql<number>`count(*)`,
    })
    .from(jobs)
    .groupBy(jobs.status);

  const stats: Record<JobStatus, number> = {
    discovered: 0,
    processing: 0,
    ready: 0,
    applied: 0,
    skipped: 0,
    expired: 0,
  };

  for (const row of result) {
    stats[row.status as JobStatus] = row.count;
  }

  return stats;
}

/**
 * Get jobs ready for processing (discovered with description).
 */
export async function getJobsForProcessing(limit: number = 10): Promise<Job[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "discovered"),
        sql`${jobs.jobDescription} IS NOT NULL`,
      ),
    )
    .orderBy(desc(jobs.discoveredAt))
    .limit(limit);

  return rows.map(mapRowToJob);
}

/**
 * Get discovered jobs missing a suitability score.
 */
export async function getUnscoredDiscoveredJobs(
  limit?: number,
): Promise<Job[]> {
  const query = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "discovered"), isNull(jobs.suitabilityScore)))
    .orderBy(desc(jobs.discoveredAt));

  const rows =
    typeof limit === "number" ? await query.limit(limit) : await query;
  return rows.map(mapRowToJob);
}

/**
 * Delete jobs by status.
 */
export async function deleteJobsByStatus(status: JobStatus): Promise<number> {
  const result = await db.delete(jobs).where(eq(jobs.status, status)).run();
  return result.changes;
}

/**
 * Delete jobs with suitability score below threshold (excluding applied jobs).
 */
export async function deleteJobsBelowScore(threshold: number): Promise<number> {
  const result = await db
    .delete(jobs)
    .where(
      and(lt(jobs.suitabilityScore, threshold), ne(jobs.status, "applied")),
    )
    .run();
  return result.changes;
}

// Helper to map database row to Job type
function mapRowToJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    source: row.source as Job["source"],
    sourceJobId: row.sourceJobId ?? null,
    jobUrlDirect: row.jobUrlDirect ?? null,
    datePosted: row.datePosted ?? null,
    title: row.title,
    employer: row.employer,
    employerUrl: row.employerUrl,
    jobUrl: row.jobUrl,
    applicationLink: row.applicationLink,
    disciplines: row.disciplines,
    deadline: row.deadline,
    salary: row.salary,
    location: row.location,
    degreeRequired: row.degreeRequired,
    starting: row.starting,
    jobDescription: row.jobDescription,
    status: row.status as JobStatus,
    outcome: row.outcome ?? null,
    closedAt: row.closedAt ?? null,
    suitabilityScore: row.suitabilityScore,
    suitabilityReason: row.suitabilityReason,
    tailoredSummary: row.tailoredSummary,
    tailoredHeadline: row.tailoredHeadline ?? null,
    tailoredSkills: row.tailoredSkills ?? null,
    selectedProjectIds: row.selectedProjectIds ?? null,
    pdfPath: row.pdfPath,
    sponsorMatchScore: row.sponsorMatchScore ?? null,
    sponsorMatchNames: row.sponsorMatchNames ?? null,
    jobType: row.jobType ?? null,
    salarySource: row.salarySource ?? null,
    salaryInterval: row.salaryInterval ?? null,
    salaryMinAmount: row.salaryMinAmount ?? null,
    salaryMaxAmount: row.salaryMaxAmount ?? null,
    salaryCurrency: row.salaryCurrency ?? null,
    isRemote: row.isRemote ?? null,
    jobLevel: row.jobLevel ?? null,
    jobFunction: row.jobFunction ?? null,
    listingType: row.listingType ?? null,
    emails: row.emails ?? null,
    companyIndustry: row.companyIndustry ?? null,
    companyLogo: row.companyLogo ?? null,
    companyUrlDirect: row.companyUrlDirect ?? null,
    companyAddresses: row.companyAddresses ?? null,
    companyNumEmployees: row.companyNumEmployees ?? null,
    companyRevenue: row.companyRevenue ?? null,
    companyDescription: row.companyDescription ?? null,
    skills: row.skills ?? null,
    experienceRange: row.experienceRange ?? null,
    companyRating: row.companyRating ?? null,
    companyReviewsCount: row.companyReviewsCount ?? null,
    vacancyCount: row.vacancyCount ?? null,
    workFromHomeType: row.workFromHomeType ?? null,
    discoveredAt: row.discoveredAt,
    processedAt: row.processedAt,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
