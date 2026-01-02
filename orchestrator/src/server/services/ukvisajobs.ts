/**
 * Service for running the UK Visa Jobs extractor (extractors/ukvisajobs).
 * 
 * Spawns the extractor as a child process and reads its output dataset.
 */

import { spawn } from 'child_process';
import { readdir, readFile, rm, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CreateJobInput } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UKVISAJOBS_DIR = join(__dirname, '../../../../extractors/ukvisajobs');
const STORAGE_DIR = join(UKVISAJOBS_DIR, 'storage/datasets/default');

export interface RunUkVisaJobsOptions {
    /** Maximum number of jobs to fetch per search term. Defaults to 50, max 200. */
    maxJobs?: number;
    /** Search keyword filter (single) - legacy support */
    searchKeyword?: string;
    /** List of search terms to run sequentially */
    searchTerms?: string[];
}

export interface UkVisaJobsResult {
    success: boolean;
    jobs: CreateJobInput[];
    error?: string;
}

/**
 * Clear previous extraction results.
 */
async function clearStorageDataset(): Promise<void> {
    try {
        await rm(STORAGE_DIR, { recursive: true, force: true });
    } catch {
        // Ignore if directory doesn't exist
    }
}

export async function runUkVisaJobs(options: RunUkVisaJobsOptions = {}): Promise<UkVisaJobsResult> {
    console.log('🇬🇧 Running UK Visa Jobs extractor...');

    // Determine terms to run
    const terms: string[] = [];
    if (options.searchTerms && options.searchTerms.length > 0) {
        terms.push(...options.searchTerms);
    } else if (options.searchKeyword) {
        terms.push(options.searchKeyword);
    } else {
        // No search terms = run once without keyword
        terms.push('');
    }

    const allJobs: CreateJobInput[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const termLabel = term ? `"${term}"` : 'all jobs';
        console.log(`   Running for ${termLabel}...`);

        try {
            // Clear previous results for this run
            await clearStorageDataset();
            await mkdir(STORAGE_DIR, { recursive: true });

            // Run the extractor
            await new Promise<void>((resolve, reject) => {
                const child = spawn('npx', ['tsx', 'src/main.ts'], {
                    cwd: UKVISAJOBS_DIR,
                    stdio: 'inherit',
                    env: {
                        ...process.env,
                        UKVISAJOBS_MAX_JOBS: String(options.maxJobs ?? 50),
                        UKVISAJOBS_SEARCH_KEYWORD: term,
                    },
                });

                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`UK Visa Jobs extractor exited with code ${code}`));
                });
                child.on('error', reject);
            });

            // Read the output dataset and accumulate
            const runJobs = await readDataset();
            let newCount = 0;

            for (const job of runJobs) {
                // Deduplicate by sourceJobId or jobUrl
                const id = job.sourceJobId || job.jobUrl;
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    allJobs.push(job);
                    newCount++;
                }
            }

            console.log(`   ✅ Fetched ${runJobs.length} jobs for ${termLabel} (${newCount} new unique)`);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ UK Visa Jobs failed for ${termLabel}: ${message}`);
            // Continue to next term instead of failing completely
        }

        // Delay between terms
        if (i < terms.length - 1) {
            console.log('   Waiting 5s before next search term...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }

    console.log(`✅ UK Visa Jobs: imported total ${allJobs.length} unique jobs`);
    return { success: true, jobs: allJobs };
}

/**
 * Read jobs from the extractor's output dataset.
 */
async function readDataset(): Promise<CreateJobInput[]> {
    const jobs: CreateJobInput[] = [];

    try {
        const files = await readdir(STORAGE_DIR);
        const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'jobs.json');

        for (const file of jsonFiles.sort()) {
            try {
                const content = await readFile(join(STORAGE_DIR, file), 'utf-8');
                const job = JSON.parse(content);

                // Map to CreateJobInput format
                jobs.push({
                    source: 'ukvisajobs',
                    sourceJobId: job.sourceJobId,
                    title: job.title || 'Unknown Title',
                    employer: job.employer || 'Unknown Employer',
                    employerUrl: job.employerUrl,
                    jobUrl: job.jobUrl,
                    applicationLink: job.applicationLink || job.jobUrl,
                    location: job.location,
                    deadline: job.deadline,
                    salary: job.salary,
                    jobDescription: job.jobDescription,
                    datePosted: job.datePosted,
                    degreeRequired: job.degreeRequired,
                    jobType: job.jobType,
                    jobLevel: job.jobLevel,
                });
            } catch {
                // Skip invalid files
            }
        }
    } catch {
        // Dataset directory doesn't exist yet
    }

    return jobs;
}
