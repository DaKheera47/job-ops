/**
 * API routes for the orchestrator.
 */

import { Router } from "express";
import { backupRouter } from "./routes/backup";
import { databaseRouter } from "./routes/database";
import { demoRouter } from "./routes/demo";
import { ghostwriterRouter } from "./routes/ghostwriter";
import { jobsRouter } from "./routes/jobs";
import { manualJobsRouter } from "./routes/manual-jobs";
import { onboardingRouter } from "./routes/onboarding";
import { pipelineRouter } from "./routes/pipeline";
import { postApplicationProvidersRouter } from "./routes/post-application-providers";
import { postApplicationReviewRouter } from "./routes/post-application-review";
import { profileRouter } from "./routes/profile";
import { settingsRouter } from "./routes/settings";
import { tracerLinksRouter } from "./routes/tracer-links";
import { visaSponsorsRouter } from "./routes/visa-sponsors";
import { webhookRouter } from "./routes/webhook";
import { authRouter } from "./routes/auth";
import { requireAuth } from "../middleware/auth";
import { loginLimiter, webauthnLimiter, reauthLimiter } from "../middleware/rateLimiter";

export const apiRouter = Router();

// Rate limiters for auth endpoints — must come before authRouter mount
apiRouter.use("/auth/login", loginLimiter);
apiRouter.use("/auth/webauthn", webauthnLimiter);
apiRouter.use("/auth/reauth", reauthLimiter);

// Auth routes (public endpoints — no JWT middleware)
apiRouter.use("/auth", authRouter);

// Public routes (no auth required)
apiRouter.use("/demo", demoRouter);
apiRouter.use("/visa-sponsors", visaSponsorsRouter);
apiRouter.use("/webhook", webhookRouter);

// Protected routes (require valid JWT)
apiRouter.use("/jobs", requireAuth, jobsRouter);
apiRouter.use("/jobs/:id/chat", requireAuth, ghostwriterRouter);
apiRouter.use("/settings", requireAuth, settingsRouter);
apiRouter.use("/pipeline", requireAuth, pipelineRouter);
apiRouter.use("/post-application", requireAuth, postApplicationProvidersRouter);
apiRouter.use("/post-application", requireAuth, postApplicationReviewRouter);
apiRouter.use("/manual-jobs", requireAuth, manualJobsRouter);
apiRouter.use("/profile", requireAuth, profileRouter);
apiRouter.use("/database", requireAuth, databaseRouter);
apiRouter.use("/onboarding", requireAuth, onboardingRouter);
apiRouter.use("/backups", requireAuth, backupRouter);
apiRouter.use("/tracer-links", requireAuth, tracerLinksRouter);
