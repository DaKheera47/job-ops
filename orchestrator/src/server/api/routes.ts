/**
 * API routes for the orchestrator.
 */

import { Router } from "express";
import { databaseRouter } from "./routes/database.js";
import { jobsRouter } from "./routes/jobs.js";
import { manualJobsRouter } from "./routes/manual-jobs.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { ukVisaJobsRouter } from "./routes/ukvisajobs.js";
import { visaSponsorsRouter } from "./routes/visa-sponsors.js";
import { webhookRouter } from "./routes/webhook.js";

export const apiRouter = Router();

apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/pipeline", pipelineRouter);
apiRouter.use("/manual-jobs", manualJobsRouter);
apiRouter.use("/ukvisajobs", ukVisaJobsRouter);
apiRouter.use("/webhook", webhookRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/database", databaseRouter);
apiRouter.use("/visa-sponsors", visaSponsorsRouter);
apiRouter.use("/onboarding", onboardingRouter);
