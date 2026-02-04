import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import type {
  ApiResponse,
  ManualJobFetchResponse,
  ManualJobInferenceResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { JSDOM } from "jsdom";
import { z } from "zod";
import * as jobsRepo from "../../repositories/jobs";
import { inferManualJobDetails } from "../../services/manualJob";
import { getProfile } from "../../services/profile";
import { scoreJobSuitability } from "../../services/scorer";

export const manualJobsRouter = Router();

const manualJobFetchSchema = z.object({
  url: z.string().trim().url().max(2000),
});

const manualJobInferenceSchema = z.object({
  jobDescription: z.string().trim().min(1).max(60000),
});

const manualJobImportSchema = z.object({
  job: z.object({
    title: z.string().trim().min(1).max(500),
    employer: z.string().trim().min(1).max(500),
    jobUrl: z.string().trim().url().max(2000).optional(),
    applicationLink: z.string().trim().url().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    salary: z.string().trim().max(200).optional(),
    deadline: z.string().trim().max(100).optional(),
    jobDescription: z.string().trim().min(1).max(40000),
    jobType: z.string().trim().max(200).optional(),
    jobLevel: z.string().trim().max(200).optional(),
    jobFunction: z.string().trim().max(200).optional(),
    disciplines: z.string().trim().max(200).optional(),
    degreeRequired: z.string().trim().max(200).optional(),
    starting: z.string().trim().max(200).optional(),
  }),
});

const cleanOptional = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * POST /api/manual-jobs/fetch - Fetch and extract job content from a URL
 */
manualJobsRouter.post("/fetch", async (req: Request, res: Response) => {
  try {
    const input = manualJobFetchSchema.parse(req.body ?? {});

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      });
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract page title (often contains job title)
    const pageTitle =
      document.querySelector("title")?.textContent?.trim() || "";

    // Extract meta description
    const metaDescription =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
        ?.trim() || "";

    // Extract Open Graph data
    const ogTitle =
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content")
        ?.trim() || "";
    const ogDescription =
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content")
        ?.trim() || "";
    const ogSiteName =
      document
        .querySelector('meta[property="og:site-name"]')
        ?.getAttribute("content")
        ?.trim() || "";

    // Remove non-content elements
    const elementsToRemove = document.querySelectorAll(
      "script, style, nav, header, footer, aside, iframe, noscript, " +
        '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
        ".nav, .navbar, .header, .footer, .sidebar, .menu, .cookie, .popup, .modal, .ad, .advertisement",
    );
    elementsToRemove.forEach((el) => {
      el.remove();
    });

    // Try to find the main job content area
    const mainContent =
      document.querySelector(
        'main, [role="main"], article, ' +
          ".job-description, .job-details, .job-content, .vacancy-description, " +
          "#job-description, #job-details, #job-content, " +
          '[class*="job-desc"], [class*="jobDesc"], [class*="vacancy"], [class*="posting"]',
      ) || document.body;

    // Get text content
    let textContent = mainContent?.textContent || "";

    // Clean up whitespace
    textContent = textContent
      .replace(/[\t ]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Build enriched content with extracted metadata
    let enrichedContent = "";
    if (pageTitle) enrichedContent += `Page Title: ${pageTitle}\n`;
    if (ogTitle && ogTitle !== pageTitle)
      enrichedContent += `Job Title: ${ogTitle}\n`;
    if (ogSiteName) enrichedContent += `Company/Site: ${ogSiteName}\n`;
    if (ogDescription) enrichedContent += `Summary: ${ogDescription}\n`;
    if (metaDescription && metaDescription !== ogDescription)
      enrichedContent += `Description: ${metaDescription}\n`;
    if (enrichedContent) enrichedContent += "\n---\n\n";
    enrichedContent += textContent;

    // Limit to reasonable size
    if (enrichedContent.length > 50000) {
      enrichedContent = enrichedContent.substring(0, 50000);
    }

    const result: ApiResponse<ManualJobFetchResponse> = {
      ok: true,
      data: {
        content: enrichedContent,
        url: input.url,
      },
    };

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof Error && error.name === "AbortError") {
      return res
        .status(408)
        .json({ success: false, error: "Request timed out" });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/manual-jobs/infer - Infer job details from a pasted description
 */
manualJobsRouter.post("/infer", async (req: Request, res: Response) => {
  try {
    const input = manualJobInferenceSchema.parse(req.body ?? {});
    const result = await inferManualJobDetails(input.jobDescription);

    const response: ApiResponse<ManualJobInferenceResponse> = {
      ok: true,
      data: {
        job: result.job,
        warning: result.warning ?? null,
      },
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/manual-jobs/import - Import a manually curated job into the DB
 */
manualJobsRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const input = manualJobImportSchema.parse(req.body ?? {});
    const job = input.job;

    const jobUrl =
      cleanOptional(job.jobUrl) ||
      cleanOptional(job.applicationLink) ||
      `manual://${randomUUID()}`;

    const createdJob = await jobsRepo.createJob({
      source: "manual",
      title: job.title.trim(),
      employer: job.employer.trim(),
      jobUrl,
      applicationLink: cleanOptional(job.applicationLink) ?? undefined,
      location: cleanOptional(job.location) ?? undefined,
      salary: cleanOptional(job.salary) ?? undefined,
      deadline: cleanOptional(job.deadline) ?? undefined,
      jobDescription: job.jobDescription.trim(),
      jobType: cleanOptional(job.jobType) ?? undefined,
      jobLevel: cleanOptional(job.jobLevel) ?? undefined,
      jobFunction: cleanOptional(job.jobFunction) ?? undefined,
      disciplines: cleanOptional(job.disciplines) ?? undefined,
      degreeRequired: cleanOptional(job.degreeRequired) ?? undefined,
      starting: cleanOptional(job.starting) ?? undefined,
    });

    // Score asynchronously so the import returns immediately.
    (async () => {
      try {
        const rawProfile = await getProfile();
        if (
          !rawProfile ||
          typeof rawProfile !== "object" ||
          Array.isArray(rawProfile)
        ) {
          throw new Error("Invalid resume profile format");
        }
        const profile = rawProfile as Record<string, unknown>;
        const { score, reason } = await scoreJobSuitability(
          createdJob,
          profile,
        );
        await jobsRepo.updateJob(createdJob.id, {
          suitabilityScore: score,
          suitabilityReason: reason,
        });
      } catch (error) {
        logger.warn("Manual job scoring failed", error);
      }
    })().catch((error) => {
      logger.warn("Manual job scoring task failed to start", error);
    });

    res.json({ success: true, data: createdJob });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
