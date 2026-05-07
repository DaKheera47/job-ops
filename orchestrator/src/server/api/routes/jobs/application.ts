import { badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { isDemoMode } from "@server/config/demo";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import * as jobsRepo from "@server/repositories/jobs";
import { trackCanonicalActivationEvent } from "@server/services/activation-funnel";
import { transitionStage } from "@server/services/applicationTracking";
import { simulateApplyJob } from "@server/services/demo-simulator";
import { notifyJobCompleteWebhook } from "@server/services/jobs/webhooks";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { type Request, type Response, Router } from "express";
import { hydrateJobPdfFreshness } from "./shared";

export const jobsApplicationRouter = Router();

jobsApplicationRouter.post(
  "/:id/check-sponsor",
  async (req: Request, res: Response) => {
    try {
      const job = await jobsRepo.getJobById(req.params.id);

      if (!job) {
        return fail(res, notFound("Job not found"));
      }

      if (!job.employer) {
        return fail(res, badRequest("Job has no employer name"));
      }

      const sponsorResults = await visaSponsors.searchSponsors(job.employer, {
        limit: 10,
        minScore: 50,
      });

      const { sponsorMatchScore, sponsorMatchNames } =
        visaSponsors.calculateSponsorMatchSummary(sponsorResults);

      const updatedJob = await jobsRepo.updateJob(job.id, {
        sponsorMatchScore: sponsorMatchScore,
        sponsorMatchNames: sponsorMatchNames ?? undefined,
      });

      if (!updatedJob) {
        return fail(res, notFound("Job not found"));
      }

      if (sponsorMatchScore >= 50 && sponsorResults.length > 0) {
        void trackServerProductEvent(
          "sponsor_match_found",
          {
            match_score: sponsorMatchScore,
            match_count: sponsorResults.length,
          },
          {
            requestOrigin: resolveRequestOrigin(req),
            urlPath: "/visa-sponsors",
          },
        );
      }

      ok(res, {
        ...(await hydrateJobPdfFreshness(updatedJob)),
        matchResults: sponsorResults.slice(0, 5).map((r) => ({
          name: r.sponsor.organisationName,
          score: r.score,
        })),
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

jobsApplicationRouter.post(
  "/:id/apply",
  async (req: Request, res: Response) => {
    try {
      if (isDemoMode()) {
        const updatedJob = await simulateApplyJob(req.params.id);
        return okWithMeta(res, await hydrateJobPdfFreshness(updatedJob), {
          simulated: true,
        });
      }

      const job = await jobsRepo.getJobById(req.params.id);

      if (!job) {
        return fail(res, notFound("Job not found"));
      }

      const appliedAtDate = new Date();
      const appliedAt = appliedAtDate.toISOString();

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

      const updatedJob = await jobsRepo.updateJob(job.id, {
        status: "applied",
        appliedAt,
      });

      if (updatedJob) {
        void trackCanonicalActivationEvent(
          "application_marked_applied",
          {
            source: "jobs_apply_route",
            had_pdf: Boolean(updatedJob.pdfPath),
            tracer_links_enabled: Boolean(updatedJob.tracerLinksEnabled),
            sponsor_match_found:
              typeof updatedJob.sponsorMatchScore === "number" &&
              updatedJob.sponsorMatchScore >= 50,
          },
          {
            occurredAt: appliedAtDate,
            requestOrigin: resolveRequestOrigin(req),
            urlPath: "/jobs",
          },
        );
        notifyJobCompleteWebhook(updatedJob).catch((error) => {
          logger.warn("Job complete webhook dispatch failed", error);
        });
      }

      if (!updatedJob) {
        return fail(res, notFound("Job not found"));
      }

      ok(res, await hydrateJobPdfFreshness(updatedJob));
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);
