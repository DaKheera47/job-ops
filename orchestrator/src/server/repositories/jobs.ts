/**
 * Job repository - data access layer for jobs.
 */

import { eq, desc, sql, and, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db, schema } from '../db/index.js';
import type { Job, CreateJobInput, UpdateJobInput, JobStatus } from '../../shared/types.js';

const { jobs } = schema;

/**
 * Get all jobs, optionally filtered by status.
 */
export async function getAllJobs(statuses?: JobStatus[]): Promise<Job[]> {
  const query = statuses && statuses.length > 0
    ? db.select().from(jobs).where(inArray(jobs.status, statuses)).orderBy(desc(jobs.discoveredAt))
    : db.select().from(jobs).orderBy(desc(jobs.discoveredAt));

  const rows = await query;
  return rows.map(mapRowToJob);
}

/**
 * Get a single job by ID.
 */
export async function getJobById(id: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  return row ? mapRowToJob(row) : null;
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
  return rows.map(r => r.jobUrl);
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
    status: 'discovered',
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return (await getJobById(id))!;
}

/**
 * Update a job.
 */
export async function updateJob(id: string, input: UpdateJobInput): Promise<Job | null> {
  const now = new Date().toISOString();

  await db.update(jobs)
    .set({
      ...input,
      updatedAt: now,
      ...(input.status === 'processing' ? { processedAt: now } : {}),
      ...(input.status === 'applied' && !input.appliedAt ? { appliedAt: now } : {}),
    })
    .where(eq(jobs.id, id));

  return getJobById(id);
}

/**
 * Bulk create jobs from crawler results.
 */
export async function bulkCreateJobs(inputs: CreateJobInput[]): Promise<{ created: number; skipped: number }> {
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
        eq(jobs.status, 'discovered'),
        sql`${jobs.jobDescription} IS NOT NULL`
      )
    )
    .orderBy(desc(jobs.discoveredAt))
    .limit(limit);

  return rows.map(mapRowToJob);
}

/**
 * Get discovered jobs missing a suitability score.
 */
export async function getUnscoredDiscoveredJobs(limit?: number): Promise<Job[]> {
  const query = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'discovered'), isNull(jobs.suitabilityScore)))
    .orderBy(desc(jobs.discoveredAt));

  const rows = typeof limit === 'number' ? await query.limit(limit) : await query;
  return rows.map(mapRowToJob);
}

/**
 * Delete jobs by status.
 */
export async function deleteJobsByStatus(status: JobStatus): Promise<number> {
  const result = await db.delete(jobs).where(eq(jobs.status, status)).run();
  return result.changes;
}

// Helper to map database row to Job type
function mapRowToJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    source: row.source as Job['source'],
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
    suitabilityScore: row.suitabilityScore,
    suitabilityReason: row.suitabilityReason,
    tailoredSummary: row.tailoredSummary,
    tailoredHeadline: row.tailoredHeadline ?? null,
    tailoredSkills: row.tailoredSkills ?? null,
    selectedProjectIds: row.selectedProjectIds ?? null,
    pdfPath: row.pdfPath,
    notionPageId: row.notionPageId,
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
