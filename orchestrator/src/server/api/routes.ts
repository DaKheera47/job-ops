/**
 * API routes for the orchestrator.
 */

import { Router } from "express";
import { backupRouter } from "./routes/backup";
import { databaseRouter } from "./routes/database";
import { demoRouter } from "./routes/demo";
import { jobsRouter } from "./routes/jobs";
import { manualJobsRouter } from "./routes/manual-jobs";
import { onboardingRouter } from "./routes/onboarding";
import { pipelineRouter } from "./routes/pipeline";
import { postApplicationProvidersRouter } from "./routes/post-application-providers";
import { postApplicationReviewRouter } from "./routes/post-application-review";
import { profileRouter } from "./routes/profile";
import { settingsRouter } from "./routes/settings";
import { visaSponsorsRouter } from "./routes/visa-sponsors";
import { webhookRouter } from "./routes/webhook";

export const apiRouter = Router();

apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/demo", demoRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/pipeline", pipelineRouter);
apiRouter.use("/post-application", postApplicationProvidersRouter);
apiRouter.use("/post-application", postApplicationReviewRouter);
apiRouter.use("/manual-jobs", manualJobsRouter);
apiRouter.use("/webhook", webhookRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/database", databaseRouter);
apiRouter.use("/visa-sponsors", visaSponsorsRouter);
apiRouter.use("/onboarding", onboardingRouter);
apiRouter.use("/backups", backupRouter);
