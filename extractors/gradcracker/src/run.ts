import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

type CreateJobInput = {
  source: "gradcracker";
  title: string;
  employer: string;
  jobUrl: string;
  employerUrl?: string;
  applicationLink?: string;
  disciplines?: string;
  deadline?: string;
  salary?: string;
  location?: string;
  degreeRequired?: string;
  starting?: string;
  jobDescription?: string;
};

const srcDir = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_DIR = join(srcDir, "..");
const STORAGE_DIR = join(EXTRACTOR_DIR, "storage/datasets/default");
const JOBOPS_STORAGE_DIR = join(EXTRACTOR_DIR, "storage/jobops");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";

export interface CrawlerResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export interface RunCrawlerOptions {
  existingJobUrls?: string[];
  onProgress?: (update: JobExtractorProgress) => void;
  searchTerms?: string[];
  maxJobsPerTerm?: number;
}

interface JobExtractorProgress {
  phase?: "list" | "job";
  currentUrl?: string;
  listPagesProcessed?: number;
  listPagesTotal?: number;
  jobCardsFound?: number;
  jobPagesEnqueued?: number;
  jobPagesSkipped?: number;
  jobPagesProcessed?: number;
  ts?: string;
}

async function writeExistingJobUrlsFile(
  existingJobUrls: string[] | undefined,
): Promise<string | null> {
  if (!existingJobUrls || existingJobUrls.length === 0) return null;
  await mkdir(JOBOPS_STORAGE_DIR, { recursive: true });
  const filePath = join(JOBOPS_STORAGE_DIR, "existing-job-urls.json");
  await writeFile(filePath, JSON.stringify(existingJobUrls), "utf-8");
  return filePath;
}

export async function runCrawler(
  options: RunCrawlerOptions = {},
): Promise<CrawlerResult> {
  try {
    await clearStorageDataset();
    const existingJobUrlsFile = await writeExistingJobUrlsFile(
      options.existingJobUrls,
    );

    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["run", "start"], {
        cwd: EXTRACTOR_DIR,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          JOBOPS_SKIP_APPLY_FOR_EXISTING: "1",
          JOBOPS_EMIT_PROGRESS: "1",
          GRADCRACKER_SEARCH_TERMS: options.searchTerms
            ? JSON.stringify(options.searchTerms)
            : "",
          GRADCRACKER_MAX_JOBS_PER_TERM: options.maxJobsPerTerm
            ? String(options.maxJobsPerTerm)
            : "",
          ...(existingJobUrlsFile
            ? { JOBOPS_EXISTING_JOB_URLS_FILE: existingJobUrlsFile }
            : {}),
        },
      });

      const handleLine = (line: string, stream: NodeJS.WriteStream) => {
        if (line.startsWith(JOBOPS_PROGRESS_PREFIX)) {
          const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();
          try {
            const parsed = JSON.parse(raw) as JobExtractorProgress;
            options.onProgress?.(parsed);
          } catch {
            // ignore malformed progress lines
          }
          return;
        }
        stream.write(`${line}\n`);
      };

      const stdoutRl = child.stdout
        ? createInterface({ input: child.stdout })
        : null;
      const stderrRl = child.stderr
        ? createInterface({ input: child.stderr })
        : null;

      stdoutRl?.on("line", (line) => handleLine(line, process.stdout));
      stderrRl?.on("line", (line) => handleLine(line, process.stderr));

      child.on("close", (code) => {
        stdoutRl?.close();
        stderrRl?.close();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Crawler exited with code ${code}`));
        }
      });

      child.on("error", reject);
    });

    const jobs = await readCrawledJobs();
    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, jobs: [], error: message };
  }
}

async function readCrawledJobs(): Promise<CreateJobInput[]> {
  try {
    const files = await readdir(STORAGE_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const jobs: CreateJobInput[] = [];

    for (const file of jsonFiles) {
      const content = await readFile(join(STORAGE_DIR, file), "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;

      jobs.push({
        source: "gradcracker",
        title: (data.title as string) || "Unknown Title",
        employer: (data.employer as string) || "Unknown Employer",
        employerUrl: data.employerUrl as string | undefined,
        jobUrl: (data.url as string) || (data.jobUrl as string),
        applicationLink: data.applicationLink as string | undefined,
        disciplines:
          typeof data.disciplines === "string"
            ? data.disciplines
            : Array.isArray(data.disciplines)
              ? data.disciplines
                  .filter((value): value is string => typeof value === "string")
                  .join(", ")
              : undefined,
        deadline: data.deadline as string | undefined,
        salary: data.salary as string | undefined,
        location: data.location as string | undefined,
        degreeRequired: data.degreeRequired as string | undefined,
        starting: data.starting as string | undefined,
        jobDescription: data.jobDescription as string | undefined,
      });
    }

    return jobs;
  } catch {
    return [];
  }
}

async function clearStorageDataset(): Promise<void> {
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
