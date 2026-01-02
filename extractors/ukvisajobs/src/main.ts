/**
 * UK Visa Jobs Extractor
 * 
 * Fetches job listings from my.ukvisajobs.com that may sponsor work visas.
 * Outputs JSON to stdout for the orchestrator to consume.
 * 
 * Environment variables:
 *   UKVISAJOBS_TOKEN - JWT token (required)
 *   UKVISAJOBS_AUTH_TOKEN - Auth cookie token (defaults to UKVISAJOBS_TOKEN)
 *   UKVISAJOBS_CSRF_TOKEN - CSRF token cookie
 *   UKVISAJOBS_CI_SESSION - CI session cookie
 *   UKVISAJOBS_MAX_JOBS - Maximum jobs to fetch (default: 50, max: 200) - Set via UI Settings
 *   UKVISAJOBS_SEARCH_KEYWORD - Optional search filter
 */

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = 'https://my.ukvisajobs.com/ukvisa-api/api/fetch-jobs-data';
const JOBS_PER_PAGE = 15;
const DEFAULT_MAX_JOBS = 50;
const MAX_ALLOWED_JOBS = 200;

interface UkVisaJobsApiJob {
    id: string;
    title: string;
    company_name: string;
    company_link?: string;
    job_link: string;
    city: string;
    created_date: string;
    job_expire: string;
    description?: string;
    min_salary?: string;
    max_salary?: string;
    salary_interval?: string;
    salary_method?: string;
    degree_requirement?: string;
    job_type?: string;
    job_level?: string;
    job_industry?: string;
    visa_acceptance?: string;
    applicants_outside_uk?: string;
    likely_to_sponsor?: string;
    definitely_sponsored?: string;
    new_entrant?: string;
    student_graduate?: string;
    image?: string;
    computed_cos_total?: string;
}

interface UkVisaJobsApiResponse {
    status: number;
    totalJobs: number;
    query?: string;
    jobs: UkVisaJobsApiJob[];
}

interface ExtractedJob {
    source: 'ukvisajobs';
    sourceJobId: string;
    title: string;
    employer: string;
    employerUrl?: string;
    jobUrl: string;
    applicationLink: string;
    location?: string;
    deadline?: string;
    salary?: string;
    jobDescription?: string;
    datePosted?: string;
    degreeRequired?: string;
    jobType?: string;
    jobLevel?: string;
}

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

async function fetchPage(
    pageNo: number,
    token: string,
    cookies: string,
    options: { searchKeyword?: string } = {}
): Promise<UkVisaJobsApiResponse> {
    // Use native FormData API (Node.js 18+)
    const formData = new FormData();
    formData.append('is_global', '0');
    formData.append('sortBy', 'desc');
    formData.append('pageNo', String(pageNo));
    formData.append('visaAcceptance', 'false');
    formData.append('applicants_outside_uk', 'false');
    formData.append('searchKeyword', options.searchKeyword || 'null');
    formData.append('token', token);

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'cookie': cookies,
            'origin': 'https://my.ukvisajobs.com',
            'referer': `https://my.ukvisajobs.com/open-jobs/1?is_global=0&sortBy=desc&pageNo=${pageNo}&visaAcceptance=false&applicants_outside_uk=false`,
            'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
        },
        body: formData,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`UKVisaJobs API returned ${response.status}: ${response.statusText} - ${text}`);
    }

    return response.json() as Promise<UkVisaJobsApiResponse>;
}

function mapJob(raw: UkVisaJobsApiJob): ExtractedJob {
    // Build salary string from min/max
    let salary: string | undefined = undefined;
    const minSalary = toNumberOrNull(raw.min_salary);
    const maxSalary = toNumberOrNull(raw.max_salary);

    if (minSalary !== null && minSalary > 0 && maxSalary !== null && maxSalary > 0) {
        salary = `£${minSalary.toLocaleString()}-${maxSalary.toLocaleString()}`;
        if (raw.salary_interval) {
            salary += ` / ${raw.salary_interval}`;
        }
    } else if (maxSalary !== null && maxSalary > 0) {
        salary = `£${maxSalary.toLocaleString()}`;
        if (raw.salary_interval) {
            salary += ` / ${raw.salary_interval}`;
        }
    }

    // Build a description from visa sponsorship fields
    const visaInfo: string[] = [];
    if (raw.visa_acceptance?.toLowerCase() === 'yes') visaInfo.push('Visa acceptance: Yes');
    if (raw.applicants_outside_uk?.toLowerCase() === 'yes') visaInfo.push('Accepts applicants outside UK');
    if (raw.likely_to_sponsor?.toLowerCase() === 'yes') visaInfo.push('Likely to sponsor');
    if (raw.definitely_sponsored?.toLowerCase() === 'yes') visaInfo.push('Definitely sponsored');
    if (raw.new_entrant?.toLowerCase() === 'yes') visaInfo.push('New entrant friendly');
    if (raw.student_graduate?.toLowerCase() === 'yes') visaInfo.push('Student/Graduate friendly');

    const description = raw.description
        ? raw.description
        : visaInfo.length > 0
            ? `Visa sponsorship info: ${visaInfo.join(', ')}`
            : undefined;

    return {
        source: 'ukvisajobs',
        sourceJobId: raw.id,
        title: raw.title || 'Unknown Title',
        employer: raw.company_name || 'Unknown Employer',
        employerUrl: toStringOrNull(raw.company_link) ?? undefined,
        jobUrl: raw.job_link,
        applicationLink: raw.job_link,
        location: raw.city || undefined,
        deadline: raw.job_expire || undefined,
        salary,
        jobDescription: description,
        datePosted: raw.created_date || undefined,
        degreeRequired: toStringOrNull(raw.degree_requirement) ?? undefined,
        jobType: toStringOrNull(raw.job_type) ?? undefined,
        jobLevel: toStringOrNull(raw.job_level) ?? undefined,
    };
}

async function main(): Promise<void> {
    console.log('🇬🇧 UK Visa Jobs Extractor starting...');

    // Get credentials from environment
    const token = process.env.UKVISAJOBS_TOKEN;
    const authToken = process.env.UKVISAJOBS_AUTH_TOKEN || token;
    const csrfToken = process.env.UKVISAJOBS_CSRF_TOKEN || '';
    const ciSession = process.env.UKVISAJOBS_CI_SESSION || '';
    const searchKeyword = process.env.UKVISAJOBS_SEARCH_KEYWORD || undefined;

    if (!token) {
        console.error('❌ UKVISAJOBS_TOKEN environment variable is not set');
        process.exit(1);
    }

    // Build cookies string
    const cookieParts: string[] = [];
    if (csrfToken) cookieParts.push(`csrf_token=${csrfToken}`);
    if (ciSession) cookieParts.push(`ci_session=${ciSession}`);
    if (authToken) cookieParts.push(`authToken=${authToken}`);
    const cookies = cookieParts.join('; ');

    console.log(`   Cookies configured: ${cookieParts.length > 0 ? 'Yes' : 'No'}`);
    console.log(`   Token length: ${token.length}`);

    // Get max jobs from environment
    const maxJobsEnv = toNumberOrNull(process.env.UKVISAJOBS_MAX_JOBS);
    const maxJobs = Math.min(maxJobsEnv ?? DEFAULT_MAX_JOBS, MAX_ALLOWED_JOBS);
    const maxPages = Math.ceil(maxJobs / JOBS_PER_PAGE);

    console.log(`   Max jobs: ${maxJobs} (${maxPages} pages)`);
    if (searchKeyword) {
        console.log(`   Search keyword: ${searchKeyword}`);
    }

    const allJobs: ExtractedJob[] = [];
    const seenIds = new Set<string>();
    let totalAvailable = 0;
    let pageNo = 1;

    try {
        while (pageNo <= maxPages && allJobs.length < maxJobs) {
            console.log(`   Fetching page ${pageNo}/${maxPages}...`);

            const response = await fetchPage(pageNo, token, cookies, { searchKeyword });

            if (response.status !== 1) {
                console.warn(`   ⚠️ API returned status ${response.status} on page ${pageNo}`);
                break;
            }

            if (pageNo === 1) {
                totalAvailable = response.totalJobs;
                console.log(`   Total available: ${totalAvailable} jobs`);
            }

            if (!response.jobs || response.jobs.length === 0) {
                console.log(`   No more jobs on page ${pageNo}`);
                break;
            }

            for (const rawJob of response.jobs) {
                if (allJobs.length >= maxJobs) break;

                // Deduplicate by ID
                if (seenIds.has(rawJob.id)) continue;
                seenIds.add(rawJob.id);

                const mapped = mapJob(rawJob);
                allJobs.push(mapped);
            }

            // If we got fewer jobs than a full page, we're at the end
            if (response.jobs.length < JOBS_PER_PAGE) {
                break;
            }

            pageNo++;

            // Small delay to be nice to the API
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        console.log(`✅ Scraped ${allJobs.length} jobs`);

        // Write output to storage directory (similar to Crawlee dataset structure)
        const storageDir = join(__dirname, '../storage/datasets/default');
        await mkdir(storageDir, { recursive: true });

        // Write each job as a separate JSON file (Crawlee dataset format)
        for (let i = 0; i < allJobs.length; i++) {
            const filename = join(storageDir, `${String(i + 1).padStart(6, '0')}.json`);
            await writeFile(filename, JSON.stringify(allJobs[i], null, 2));
        }

        // Also write a combined output file for easier consumption
        const outputFile = join(storageDir, 'jobs.json');
        await writeFile(outputFile, JSON.stringify(allJobs, null, 2));

        console.log(`   Output written to: ${storageDir}`);
        console.log(`   Jobs file: ${outputFile}`);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error: ${message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
