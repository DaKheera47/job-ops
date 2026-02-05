import { logger } from "@infra/logger";
import { isDemoMode, setDemoResetTimes } from "@server/config/demo";
import { db, schema } from "@server/db/index";
import * as jobsRepo from "@server/repositories/jobs";
import * as pipelineRepo from "@server/repositories/pipeline";
import { transitionStage } from "@server/services/applicationTracking";

const RESET_INTERVAL_MS = 6 * 60 * 60 * 1000;

let resetTimer: ReturnType<typeof setTimeout> | null = null;
let isResetRunning = false;

const { interviews, jobs, pipelineRuns, stageEvents, tasks } = schema;

function computeNextReset(now: Date): Date {
  return new Date(now.getTime() + RESET_INTERVAL_MS);
}

function scheduleNextReset(): void {
  const now = new Date();
  const nextReset = computeNextReset(now);
  const delay = nextReset.getTime() - now.getTime();
  setDemoResetTimes({ nextResetAt: nextReset.toISOString() });

  if (resetTimer) clearTimeout(resetTimer);

  resetTimer = setTimeout(() => {
    void runDemoResetCycle();
  }, delay);
}

async function clearDemoData(): Promise<void> {
  await db.delete(stageEvents);
  await db.delete(tasks);
  await db.delete(interviews);
  await db.delete(jobs);
  await db.delete(pipelineRuns);
}

async function seedDemoRuns(): Promise<void> {
  const first = await pipelineRepo.createPipelineRun();
  await pipelineRepo.updatePipelineRun(first.id, {
    status: "completed",
    completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    jobsDiscovered: 14,
    jobsProcessed: 6,
  });

  const second = await pipelineRepo.createPipelineRun();
  await pipelineRepo.updatePipelineRun(second.id, {
    status: "completed",
    completedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    jobsDiscovered: 9,
    jobsProcessed: 4,
  });
}

async function seedDemoJobs(): Promise<void> {
  const seededJobs = [
    {
      source: "linkedin" as const,
      title: "Software Engineer (Platform)",
      employer: "NovaStack",
      jobUrl: "https://demo.job-ops.local/jobs/novastack-platform",
      applicationLink:
        "https://demo.job-ops.local/apply/novastack-platform",
      location: "Remote (US)",
      salary: "$130,000 - $155,000",
      deadline: "2026-03-15",
      status: "ready" as const,
    },
    {
      source: "indeed" as const,
      title: "Backend Engineer",
      employer: "Acme Data Systems",
      jobUrl: "https://demo.job-ops.local/jobs/acme-backend",
      applicationLink: "https://demo.job-ops.local/apply/acme-backend",
      location: "Austin, TX",
      salary: "$120,000 - $145,000",
      deadline: "2026-03-10",
      status: "discovered" as const,
    },
    {
      source: "gradcracker" as const,
      title: "Graduate Software Developer",
      employer: "Orbital Labs",
      jobUrl: "https://demo.job-ops.local/jobs/orbital-grad",
      applicationLink: "https://demo.job-ops.local/apply/orbital-grad",
      location: "London, UK",
      salary: "GBP 42,000",
      deadline: "2026-03-20",
      status: "discovered" as const,
    },
    {
      source: "manual" as const,
      title: "Senior TypeScript Engineer",
      employer: "BrightScale",
      jobUrl: "https://demo.job-ops.local/jobs/brightscale-senior",
      applicationLink: "https://demo.job-ops.local/apply/brightscale-senior",
      location: "New York, NY",
      salary: "$155,000 - $180,000",
      deadline: "2026-03-08",
      status: "applied" as const,
    },
    {
      source: "ukvisajobs" as const,
      title: "Full Stack Engineer",
      employer: "Cloudbridge",
      jobUrl: "https://demo.job-ops.local/jobs/cloudbridge-fullstack",
      applicationLink:
        "https://demo.job-ops.local/apply/cloudbridge-fullstack",
      location: "Manchester, UK",
      salary: "GBP 55,000",
      deadline: "2026-03-02",
      status: "skipped" as const,
    },
  ];

  for (const input of seededJobs) {
    const created = await jobsRepo.createJob({
      ...input,
      jobDescription:
        "Demo job seeded for public sandbox. Real integrations are simulated.",
    });

    const score = input.status === "discovered" ? 72 : 84;
    await jobsRepo.updateJob(created.id, {
      status: input.status,
      suitabilityScore: score,
      suitabilityReason: `Demo seed score ${score} for ${created.title}.`,
      tailoredSummary:
        input.status === "discovered"
          ? undefined
          : `Demo tailored summary for ${created.title}.`,
      tailoredHeadline:
        input.status === "discovered"
          ? undefined
          : `Demo headline - ${created.title}`,
      tailoredSkills:
        input.status === "discovered"
          ? undefined
          : JSON.stringify(["TypeScript", "Node.js", "Testing"]),
      selectedProjectIds:
        input.status === "discovered"
          ? undefined
          : "demo-project-1,demo-project-2",
      pdfPath:
        input.status === "ready" || input.status === "applied"
          ? `/pdfs/demo-${created.id.slice(0, 8)}.pdf`
          : undefined,
      notionPageId:
        input.status === "applied"
          ? `demo-notion-${created.id.slice(0, 8)}`
          : undefined,
    });

    if (input.status === "applied") {
      transitionStage(
        created.id,
        "applied",
        Math.floor(Date.now() / 1000) - 60 * 60,
        { eventLabel: "Applied (seeded demo)", actor: "system" },
        null,
      );
    }
  }
}

export async function resetDemoData(): Promise<void> {
  await clearDemoData();
  await seedDemoRuns();
  await seedDemoJobs();
}

export async function runDemoResetCycle(): Promise<void> {
  if (isResetRunning) return;
  isResetRunning = true;

  try {
    await resetDemoData();
    const nowIso = new Date().toISOString();
    setDemoResetTimes({ lastResetAt: nowIso });
    scheduleNextReset();
    logger.info("Demo dataset reset completed", { lastResetAt: nowIso });
  } catch (error) {
    logger.error("Failed to reset demo dataset", { error });
    scheduleNextReset();
  } finally {
    isResetRunning = false;
  }
}

export async function initializeDemoModeServices(): Promise<void> {
  if (!isDemoMode()) return;

  await runDemoResetCycle();
  logger.info("Demo mode services initialized", {
    resetCadenceHours: RESET_INTERVAL_MS / (60 * 60 * 1000),
  });
}
