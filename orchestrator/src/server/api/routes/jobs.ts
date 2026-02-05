import { logger } from "@infra/logger";
import { sanitizeWebhookPayload } from "@infra/sanitize";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type ApiResponse,
  type Job,
  type JobStatus,
  type JobsListResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  generateFinalPdf,
  processJob,
  summarizeJob,
} from "../../pipeline/index";
import * as jobsRepo from "../../repositories/jobs";
import * as settingsRepo from "../../repositories/settings";
import {
  deleteStageEvent,
  getStageEvents,
  getTasks,
  stageEventMetadataSchema,
  transitionStage,
  updateStageEvent,
} from "../../services/applicationTracking";
import { createNotionEntry } from "../../services/notion";
import { getProfile } from "../../services/profile";
import { scoreJobSuitability } from "../../services/scorer";
import * as visaSponsors from "../../services/visa-sponsors/index";

export const jobsRouter = Router();

async function notifyJobCompleteWebhook(job: Job) {
  const overrideWebhookUrl = await settingsRepo.getSetting(
    "jobCompleteWebhookUrl",
  );
  const webhookUrl = (
    overrideWebhookUrl ||
    process.env.JOB_COMPLETE_WEBHOOK_URL ||
    ""
  ).trim();
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const payload = sanitizeWebhookPayload({
      event: "job.completed",
      sentAt: new Date().toISOString(),
      job: {
        id: job.id,
        source: job.source,
        title: job.title,
        employer: job.employer,
        status: job.status,
        suitabilityScore: job.suitabilityScore,
        sponsorMatchScore: job.sponsorMatchScore,
      },
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn("Job complete webhook POST failed", {
        status: response.status,
        response: (await response.text().catch(() => "")).slice(0, 200),
        jobId: job.id,
      });
    }
  } catch (error) {
    logger.warn("Job complete webhook POST failed", { jobId: job.id, error });
  }
}

/**
 * PATCH /api/jobs/:id - Update a job
 */
const updateJobSchema = z.object({
  status: z
    .enum([
      "discovered",
      "processing",
      "ready",
      "applied",
      "skipped",
      "expired",
    ])
    .optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
  closedAt: z.number().int().nullable().optional(),
  jobDescription: z.string().optional(),
  suitabilityScore: z.number().min(0).max(100).optional(),
  suitabilityReason: z.string().optional(),
  tailoredSummary: z.string().optional(),
  selectedProjectIds: z.string().optional(),
  pdfPath: z.string().optional(),
  sponsorMatchScore: z.number().min(0).max(100).optional(),
  sponsorMatchNames: z.string().optional(),
});

const transitionStageSchema = z.object({
  toStage: z.enum([...APPLICATION_STAGES, "no_change"]),
  occurredAt: z.number().int().nullable().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

const updateStageEventSchema = z.object({
  toStage: z.enum(APPLICATION_STAGES).optional(),
  occurredAt: z.number().int().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

const updateOutcomeSchema = z.object({
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  closedAt: z.number().int().nullable().optional(),
});

/**
 * GET /api/jobs - List all jobs
 * Query params: status (comma-separated list of statuses to filter)
 */
jobsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const statuses = statusFilter?.split(",").filter(Boolean) as
      | JobStatus[]
      | undefined;

    const jobs = await jobsRepo.getAllJobs(statuses);
    const stats = await jobsRepo.getJobStats();

    const response: ApiResponse<JobsListResponse> = {
      ok: true,
      data: {
        jobs,
        total: jobs.length,
        byStatus: stats,
      },
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id - Get a single job
 */
jobsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id/events - Get stage event timeline
 */
jobsRouter.get("/:id/events", async (req: Request, res: Response) => {
  try {
    const events = await getStageEvents(req.params.id);
    res.json({ success: true, data: events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id/tasks - Get tasks for an application
 */
jobsRouter.get("/:id/tasks", async (req: Request, res: Response) => {
  try {
    const includeCompleted =
      req.query.includeCompleted === "1" ||
      req.query.includeCompleted === "true";
    const tasks = await getTasks(req.params.id, includeCompleted);
    res.json({ success: true, data: tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/stages - Transition stage
 */
jobsRouter.post("/:id/stages", async (req: Request, res: Response) => {
  try {
    const input = transitionStageSchema.parse(req.body);
    const event = transitionStage(
      req.params.id,
      input.toStage,
      input.occurredAt ?? undefined,
      input.metadata ?? null,
      input.outcome ?? null,
    );
    res.json({ success: true, data: event });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/jobs/:id/events/:eventId - Update an event
 */
jobsRouter.patch(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      const input = updateStageEventSchema.parse(req.body);
      updateStageEvent(req.params.eventId, input);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  },
);

/**
 * DELETE /api/jobs/:id/events/:eventId - Delete an event
 */
jobsRouter.delete(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      deleteStageEvent(req.params.eventId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  },
);

/**
 * PATCH /api/jobs/:id/outcome - Close out application
 */
jobsRouter.patch("/:id/outcome", async (req: Request, res: Response) => {
  try {
    const input = updateOutcomeSchema.parse(req.body);
    const closedAt = input.outcome
      ? (input.closedAt ?? Math.floor(Date.now() / 1000))
      : null;
    const job = await jobsRepo.updateJob(req.params.id, {
      outcome: input.outcome,
      closedAt,
    });

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

jobsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const input = updateJobSchema.parse(req.body);
    const job = await jobsRepo.updateJob(req.params.id, input);

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/summarize - Generate AI summary and suggest projects
 */
jobsRouter.post("/:id/summarize", async (req: Request, res: Response) => {
  try {
    const forceRaw = req.query.force as string | undefined;
    const force = forceRaw === "1" || forceRaw === "true";

    const result = await summarizeJob(req.params.id, { force });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/rescore - Regenerate suitability score + reason
 */
jobsRouter.post("/:id/rescore", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const rawProfile = await getProfile();
    if (
      !rawProfile ||
      typeof rawProfile !== "object" ||
      Array.isArray(rawProfile)
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid resume profile format" });
    }

    const { score, reason } = await scoreJobSuitability(
      job,
      rawProfile as Record<string, unknown>,
    );

    const updatedJob = await jobsRepo.updateJob(job.id, {
      suitabilityScore: score,
      suitabilityReason: reason,
    });

    if (!updatedJob) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/check-sponsor - Check if employer is a visa sponsor
 */
jobsRouter.post("/:id/check-sponsor", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    if (!job.employer) {
      return res
        .status(400)
        .json({ success: false, error: "Job has no employer name" });
    }

    // Search for sponsor matches
    const sponsorResults = visaSponsors.searchSponsors(job.employer, {
      limit: 10,
      minScore: 50,
    });

    const { sponsorMatchScore, sponsorMatchNames } =
      visaSponsors.calculateSponsorMatchSummary(sponsorResults);

    // Update job with sponsor match info
    const updatedJob = await jobsRepo.updateJob(job.id, {
      sponsorMatchScore: sponsorMatchScore,
      sponsorMatchNames: sponsorMatchNames ?? undefined,
    });

    res.json({
      success: true,
      data: updatedJob,
      matchResults: sponsorResults.slice(0, 5).map((r) => ({
        name: r.sponsor.organisationName,
        score: r.score,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/generate-pdf - Generate PDF using current manual overrides
 */
jobsRouter.post("/:id/generate-pdf", async (req: Request, res: Response) => {
  try {
    const result = await generateFinalPdf(req.params.id);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/process - Process a single job (generate summary + PDF)
 */
jobsRouter.post("/:id/process", async (req: Request, res: Response) => {
  try {
    const forceRaw = req.query.force as string | undefined;
    const force = forceRaw === "1" || forceRaw === "true";

    const result = await processJob(req.params.id, { force });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/apply - Mark a job as applied and sync to Notion
 */
jobsRouter.post("/:id/apply", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const appliedAtDate = new Date();
    const appliedAt = appliedAtDate.toISOString();

    // Sync to Notion
    const notionResult = await createNotionEntry({
      id: job.id,
      title: job.title,
      employer: job.employer,
      applicationLink: job.applicationLink,
      deadline: job.deadline,
      salary: job.salary,
      location: job.location,
      pdfPath: job.pdfPath,
      appliedAt,
    });

    transitionStage(
      job.id,
      "applied",
      Math.floor(appliedAtDate.getTime() / 1000),
      {
        eventLabel: "Applied",
        actor: "system",
      },
      null,
    );

    // Update job status + Notion metadata
    const updatedJob = await jobsRepo.updateJob(job.id, {
      status: "applied",
      appliedAt,
      notionPageId: notionResult.pageId,
    });

    if (updatedJob) {
      notifyJobCompleteWebhook(updatedJob).catch((error) => {
        logger.warn("Job complete webhook dispatch failed", error);
      });
    }

    if (!updatedJob) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/skip - Mark a job as skipped
 */
jobsRouter.post("/:id/skip", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.updateJob(req.params.id, { status: "skipped" });

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/jobs/status/:status - Clear jobs with a specific status
 */
jobsRouter.delete("/status/:status", async (req: Request, res: Response) => {
  try {
    const status = req.params.status as JobStatus;
    const count = await jobsRepo.deleteJobsByStatus(status);

    res.json({
      success: true,
      data: {
        message: `Cleared ${count} ${status} jobs`,
        count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
