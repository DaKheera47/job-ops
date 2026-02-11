import { badRequest } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  POST_APPLICATION_PROVIDER_ACTIONS,
  POST_APPLICATION_PROVIDERS,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { executePostApplicationProviderAction } from "../../services/post-application/providers";

const providerActionParamsSchema = z.object({
  provider: z.enum(POST_APPLICATION_PROVIDERS),
  action: z.enum(POST_APPLICATION_PROVIDER_ACTIONS),
});

const accountBodySchema = z.object({
  accountKey: z.string().min(1).max(255).optional(),
});

const connectBodySchema = accountBodySchema.extend({
  payload: z.record(z.string(), z.unknown()).optional(),
});

const syncBodySchema = accountBodySchema.extend({
  maxMessages: z.number().int().min(1).max(500).optional(),
  searchDays: z.number().int().min(1).max(365).optional(),
});

export const postApplicationProvidersRouter = Router();

postApplicationProvidersRouter.post(
  "/providers/:provider/actions/:action",
  asyncRoute(async (req: Request, res: Response) => {
    let provider: (typeof POST_APPLICATION_PROVIDERS)[number];
    let action: (typeof POST_APPLICATION_PROVIDER_ACTIONS)[number];

    try {
      const parsedParams = providerActionParamsSchema.parse(req.params);
      provider = parsedParams.provider;
      action = parsedParams.action;
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }

    let accountKey = "default";
    let connectPayload:
      | {
          accountKey?: string;
          payload?: Record<string, unknown>;
        }
      | undefined;
    let syncPayload:
      | {
          accountKey?: string;
          maxMessages?: number;
          searchDays?: number;
        }
      | undefined;

    try {
      if (action === "connect") {
        const parsedBody = connectBodySchema.parse(req.body ?? {});
        accountKey = parsedBody.accountKey ?? "default";
        connectPayload = {
          ...(parsedBody.accountKey
            ? { accountKey: parsedBody.accountKey }
            : {}),
          ...(parsedBody.payload ? { payload: parsedBody.payload } : {}),
        };
      } else if (action === "sync") {
        const parsedBody = syncBodySchema.parse(req.body ?? {});
        accountKey = parsedBody.accountKey ?? "default";
        syncPayload = {
          ...(parsedBody.accountKey
            ? { accountKey: parsedBody.accountKey }
            : {}),
          ...(typeof parsedBody.maxMessages === "number"
            ? { maxMessages: parsedBody.maxMessages }
            : {}),
          ...(typeof parsedBody.searchDays === "number"
            ? { searchDays: parsedBody.searchDays }
            : {}),
        };
      } else {
        const parsedBody = accountBodySchema.parse(req.body ?? {});
        accountKey = parsedBody.accountKey ?? "default";
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }

    const response = await executePostApplicationProviderAction({
      provider,
      action,
      accountKey,
      connectPayload,
      syncPayload,
      initiatedBy: null,
    });

    ok(res, response);
  }),
);
