import { badRequest, notFound, serviceUnavailable } from "@infra/errors";
import { logger } from "@infra/logger";
import { setupSse, startSseHeartbeat, writeSseData } from "@infra/sse";
import { getProfile } from "@server/services/profile";
import { type Request, type Response, Router } from "express";
import * as jobsRepo from "../../repositories/jobs";
import {
  cancelBatchApply,
  getBatchProgress,
  isBatchRunning,
  startBatchApply,
  subscribeToBatchProgress,
} from "../../services/linkedin-auto-apply/batch";
import {
  cancelEasyApply,
  getLinkedInApplyProgress,
  getLinkedInSessionStatus,
  isBusy,
  logoutLinkedIn,
  startEasyApply,
  startLinkedInLogin,
  subscribeToLinkedInApplyProgress,
  verifySession,
} from "../../services/linkedin-auto-apply";

export const linkedInApplyRouter = Router();

// --- Session endpoints ---

linkedInApplyRouter.get("/session/status", async (_req: Request, res: Response) => {
  const status = await getLinkedInSessionStatus();
  res.json(status);
});

linkedInApplyRouter.post("/session/login", async (_req: Request, res: Response) => {
  try {
    const result = await startLinkedInLogin();
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already in progress")) {
      throw badRequest(message);
    }
    throw serviceUnavailable(message);
  }
});

linkedInApplyRouter.post("/session/verify", async (_req: Request, res: Response) => {
  const result = await verifySession();
  res.json(result);
});

linkedInApplyRouter.post("/session/logout", async (_req: Request, res: Response) => {
  await logoutLinkedIn();
  res.json({ success: true });
});

// --- Easy Apply endpoints ---

linkedInApplyRouter.post(
  "/jobs/:id/easy-apply",
  async (req: Request, res: Response) => {
    const jobId = req.params.id;
    if (!jobId) throw badRequest("Job ID is required");

    const job = await jobsRepo.getJobById(jobId);
    if (!job) throw notFound("Job not found");

    if (job.status !== "ready") {
      throw badRequest(`Job must be in "ready" status to auto-apply (current: ${job.status})`);
    }

    if (job.source !== "linkedin") {
      throw badRequest("Auto-apply is only available for LinkedIn jobs");
    }

    if (isBusy()) {
      throw badRequest("A LinkedIn operation is already in progress");
    }

    const jobUrl = job.applicationLink || job.jobUrlDirect || job.jobUrl;
    if (!jobUrl) {
      throw badRequest("Job has no application URL");
    }

    // Get profile for contact info
    const profile = await getProfile();
    const basics = profile?.basics;

    const autoSubmit = req.body?.autoSubmit === true;

    // Start easy-apply in background, return immediately
    const applyPromise = startEasyApply({
      jobId,
      jobUrl,
      pdfPath: job.pdfPath,
      profileName: basics?.name || "",
      profileEmail: basics?.email || "",
      profilePhone: basics?.phone || "",
      autoSubmit,
    });

    // Handle completion in background
    applyPromise
      .then(async (result) => {
        if (result.success) {
          try {
            await jobsRepo.updateJob(jobId, {
              status: "applied",
              appliedAt: new Date().toISOString(),
            });
            logger.info("LinkedIn auto-apply succeeded, job marked as applied", {
              jobId,
            });
          } catch (error) {
            logger.error("Failed to mark job as applied after auto-apply", {
              jobId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })
      .catch((error) => {
        logger.error("LinkedIn auto-apply background error", {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    // Return immediately with viewer URL
    const progress = getLinkedInApplyProgress();
    res.json({
      started: true,
      viewerUrl: progress.viewerUrl || null,
    });
  },
);

linkedInApplyRouter.post(
  "/jobs/:id/easy-apply/cancel",
  async (req: Request, res: Response) => {
    cancelEasyApply();
    res.json({ cancelled: true });
  },
);

// --- SSE Progress endpoint ---

linkedInApplyRouter.get(
  "/jobs/:id/easy-apply/progress",
  (req: Request, res: Response) => {
    setupSse(res, { disableBuffering: true, flushHeaders: true });
    const stopHeartbeat = startSseHeartbeat(res);

    // Send current state immediately
    const current = getLinkedInApplyProgress();
    writeSseData(res, current);

    const unsubscribe = subscribeToLinkedInApplyProgress((progress) => {
      writeSseData(res, progress);

      // End stream on terminal states
      if (
        progress.step === "completed" ||
        progress.step === "failed" ||
        progress.step === "manual_required"
      ) {
        stopHeartbeat();
        unsubscribe();
        res.end();
      }
    });

    req.on("close", () => {
      stopHeartbeat();
      unsubscribe();
    });
  },
);

// --- Batch Apply endpoints ---

linkedInApplyRouter.post("/batch-apply", async (req: Request, res: Response) => {
  if (isBatchRunning()) {
    throw badRequest("Batch apply is already running");
  }

  let jobIds: string[];

  if (req.body?.filter === "all_ready_linkedin") {
    const allJobs = await jobsRepo.getJobListItems(["ready"]);
    jobIds = allJobs
      .filter((j) => j.source === "linkedin")
      .map((j) => j.id);
  } else if (Array.isArray(req.body?.jobIds)) {
    jobIds = req.body.jobIds;
  } else {
    throw badRequest("Provide jobIds array or filter: 'all_ready_linkedin'");
  }

  if (jobIds.length === 0) {
    throw badRequest("No LinkedIn ready jobs found");
  }

  // Start in background
  startBatchApply(jobIds).catch((error) => {
    logger.error("Batch apply background error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  res.json({ started: true, totalJobs: jobIds.length });
});

linkedInApplyRouter.post("/batch-apply/cancel", (_req: Request, res: Response) => {
  cancelBatchApply();
  res.json({ cancelled: true });
});

linkedInApplyRouter.get("/batch-apply/progress", (req: Request, res: Response) => {
  setupSse(res, { disableBuffering: true, flushHeaders: true });
  const stopHeartbeat = startSseHeartbeat(res);

  const current = getBatchProgress();
  writeSseData(res, current);

  const unsubscribe = subscribeToBatchProgress((progress) => {
    writeSseData(res, progress);

    if (!progress.running) {
      stopHeartbeat();
      unsubscribe();
      res.end();
    }
  });

  req.on("close", () => {
    stopHeartbeat();
    unsubscribe();
  });
});
