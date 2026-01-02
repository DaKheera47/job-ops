/**
 * Service for running the Gradcracker crawler (extractors/gradcracker).
 * Wraps the existing Crawlee-based crawler.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import type { CreateJobInput } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRAWLER_DIR = join(__dirname, '../../../../extractors/gradcracker');
const STORAGE_DIR = join(CRAWLER_DIR, 'storage/datasets/default');
const JOBOPS_STORAGE_DIR = join(CRAWLER_DIR, 'storage/jobops');

export interface CrawlerResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export interface RunCrawlerOptions {
  /**
   * List of job page URLs already present in the orchestrator DB.
   * Used by the crawler to avoid expensive/undesired interactions (e.g. apply button click).
   */
  existingJobUrls?: string[];

  /**
   * Optional callback for live crawl progress emitted by the Gradcracker extractor.
   */
  onProgress?: (update: JobExtractorProgress) => void;

  /**
   * List of search terms to be used as roles for URL generation.
   */
  searchTerms?: string[];
}

interface JobExtractorProgress {
  phase?: 'list' | 'job';
  currentUrl?: string;
  listPagesProcessed?: number;
  listPagesTotal?: number;
  jobCardsFound?: number;
  jobPagesEnqueued?: number;
  jobPagesSkipped?: number;
  jobPagesProcessed?: number;
  ts?: string;
}

const JOBOPS_PROGRESS_PREFIX = 'JOBOPS_PROGRESS ';

async function writeExistingJobUrlsFile(existingJobUrls: string[] | undefined): Promise<string | null> {
  if (!existingJobUrls || existingJobUrls.length === 0) return null;
  await mkdir(JOBOPS_STORAGE_DIR, { recursive: true });
  const filePath = join(JOBOPS_STORAGE_DIR, 'existing-job-urls.json');
  await writeFile(filePath, JSON.stringify(existingJobUrls), 'utf-8');
  return filePath;
}

/**
 * Run the Gradcracker crawler and return discovered jobs.
 */
export async function runCrawler(options: RunCrawlerOptions = {}): Promise<CrawlerResult> {
  console.log('🕷️ Starting job crawler...');

  try {
    // Clear previous results
    await clearStorageDataset();

    const existingJobUrlsFile = await writeExistingJobUrlsFile(options.existingJobUrls);

    // Run the crawler
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npm', ['run', 'start'], {
        cwd: CRAWLER_DIR,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          JOBOPS_SKIP_APPLY_FOR_EXISTING: '1',
          JOBOPS_EMIT_PROGRESS: '1',
          GRADCRACKER_SEARCH_TERMS: options.searchTerms ? JSON.stringify(options.searchTerms) : '',
          ...(existingJobUrlsFile ? { JOBOPS_EXISTING_JOB_URLS_FILE: existingJobUrlsFile } : {}),
        },
      });

      const handleLine = (line: string, stream: NodeJS.WriteStream) => {
        if (line.startsWith(JOBOPS_PROGRESS_PREFIX)) {
          const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();
          try {
            const parsed = JSON.parse(raw) as JobExtractorProgress;
            options.onProgress?.(parsed);
          } catch {
            // Ignore malformed progress lines
          }
          return;
        }
        stream.write(`${line}\n`);
      };

      const stdoutRl = child.stdout ? createInterface({ input: child.stdout }) : null;
      const stderrRl = child.stderr ? createInterface({ input: child.stderr }) : null;

      stdoutRl?.on('line', (line) => handleLine(line, process.stdout));
      stderrRl?.on('line', (line) => handleLine(line, process.stderr));

      child.on('close', (code) => {
        stdoutRl?.close();
        stderrRl?.close();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Crawler exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });

    // Read crawled jobs from storage
    const jobs = await readCrawledJobs();

    console.log(`✅ Crawler completed. Found ${jobs.length} jobs.`);

    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Crawler failed:', message);
    return { success: false, jobs: [], error: message };
  }
}

/**
 * Read crawled jobs from the Crawlee storage dataset.
 */
async function readCrawledJobs(): Promise<CreateJobInput[]> {
  try {
    const files = await readdir(STORAGE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const jobs: CreateJobInput[] = [];

    for (const file of jsonFiles) {
      const content = await readFile(join(STORAGE_DIR, file), 'utf-8');
      const data = JSON.parse(content);

      // Map crawler output to our job input format
      jobs.push({
        source: 'gradcracker',
        title: data.title || 'Unknown Title',
        employer: data.employer || 'Unknown Employer',
        employerUrl: data.employerUrl,
        jobUrl: data.url || data.jobUrl,
        applicationLink: data.applicationLink,
        disciplines: data.disciplines,
        deadline: data.deadline,
        salary: data.salary,
        location: data.location,
        degreeRequired: data.degreeRequired,
        starting: data.starting,
        jobDescription: data.jobDescription,
      });
    }

    return jobs;
  } catch (error) {
    console.error('Failed to read crawled jobs:', error);
    return [];
  }
}

/**
 * Clear previous crawl results.
 */
async function clearStorageDataset(): Promise<void> {
  const { rm } = await import('fs/promises');
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}
