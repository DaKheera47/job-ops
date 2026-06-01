import { asyncRoute, ok, okWithMeta } from "@infra/http";
import { isDemoMode } from "@server/config/demo";
import { suggestOnboardingSearchTerms } from "@server/services/onboarding-search-terms";
import {
  getOnboardingStatus,
  saveOnboardingModelAction,
  saveOnboardingRxResumeAction,
  validateLlm,
  validateResumeConfig,
  validateRxresume,
} from "@server/services/onboarding-status";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const onboardingRouter = Router();

const modelActionSchema = z.object({
  provider: z.string().trim().min(1).max(100).optional().nullable(),
  baseUrl: z.string().trim().max(2000).optional().nullable(),
  apiKey: z.string().trim().max(2000).optional().nullable(),
  model: z.string().trim().max(200).optional().nullable(),
});

const rxresumeActionSchema = z.object({
  apiKey: z.string().trim().max(2000).optional().nullable(),
  baseUrl: z.string().trim().max(2000).optional().nullable(),
  rxresumeBaseResumeId: z.string().trim().max(200).optional().nullable(),
});

onboardingRouter.get(
  "/status",
  asyncRoute(async (_req: Request, res: Response) => {
    const data = await getOnboardingStatus();
    ok(res, data);
  }),
);

onboardingRouter.post(
  "/actions/model",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(res, await getOnboardingStatus(), { simulated: true });
    }

    const input = modelActionSchema.parse(req.body ?? {});
    const data = await saveOnboardingModelAction(input);
    ok(res, data);
  }),
);

onboardingRouter.post(
  "/actions/rxresume",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(res, await getOnboardingStatus(), { simulated: true });
    }

    const input = rxresumeActionSchema.parse(req.body ?? {});
    const data = await saveOnboardingRxResumeAction({
      ...input,
      hasRxresumeBaseResumeId: Object.hasOwn(
        req.body ?? {},
        "rxresumeBaseResumeId",
      ),
    });
    ok(res, data);
  }),
);

onboardingRouter.post(
  "/validate/openrouter",
  async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message:
            "Demo mode: OpenRouter validation is simulated and always succeeds.",
        },
        { simulated: true },
      );
    }

    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const result = await validateLlm({ apiKey, provider: "openrouter" });
    ok(res, result);
  },
);

onboardingRouter.post("/validate/llm", async (req: Request, res: Response) => {
  if (isDemoMode()) {
    return okWithMeta(
      res,
      {
        valid: true,
        message: "Demo mode: LLM validation is simulated.",
      },
      { simulated: true },
    );
  }

  const apiKey =
    typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
  const provider =
    typeof req.body?.provider === "string" ? req.body.provider : undefined;
  const baseUrl =
    typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
  const result = await validateLlm({ apiKey, provider, baseUrl });
  ok(res, result);
});

onboardingRouter.post(
  "/validate/rxresume",
  async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message: "Demo mode: RxResume validation is simulated.",
        },
        { simulated: true },
      );
    }

    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const baseUrl =
      typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
    const result = await validateRxresume({
      apiKey,
      baseUrl,
    });
    ok(res, result);
  },
);

onboardingRouter.get(
  "/validate/resume",
  async (_req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message: "Demo mode: resume validation is simulated.",
        },
        { simulated: true },
      );
    }

    const result = await validateResumeConfig();
    ok(res, result);
  },
);

onboardingRouter.post(
  "/search-terms/suggest",
  asyncRoute(async (_req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          terms: [
            "Product Engineer",
            "Full Stack Engineer",
            "Frontend Engineer",
            "Backend Engineer",
            "Software Engineer",
          ],
          source: "fallback",
        },
        { simulated: true },
      );
    }

    const result = await suggestOnboardingSearchTerms();
    ok(res, result);
  }),
);
