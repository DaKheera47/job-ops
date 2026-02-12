import { badRequest } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  APPLICATION_STAGES,
  POST_APPLICATION_PROVIDERS,
  POST_APPLICATION_ROUTER_STAGE_TARGETS,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  approvePostApplicationInboxItem,
  bulkPostApplicationInboxAction,
  denyPostApplicationInboxItem,
  listPostApplicationInbox,
  listPostApplicationReviewRuns,
  listPostApplicationRunMessages,
} from "../../services/post-application/review";

const listQuerySchema = z.object({
  provider: z.enum(POST_APPLICATION_PROVIDERS).default("gmail"),
  accountKey: z.string().min(1).max(255).default("default"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const inboxParamsSchema = z.object({
  messageId: z.string().uuid(),
});

const runParamsSchema = z.object({
  runId: z.string().uuid(),
});

const approveBodySchema = z.object({
  provider: z.enum(POST_APPLICATION_PROVIDERS).default("gmail"),
  accountKey: z.string().min(1).max(255).default("default"),
  jobId: z.string().uuid().optional(),
  stageTarget: z.enum(POST_APPLICATION_ROUTER_STAGE_TARGETS).optional(),
  toStage: z.enum(APPLICATION_STAGES).optional(),
  note: z.string().max(2000).optional(),
  decidedBy: z.string().max(255).optional(),
});

const denyBodySchema = z.object({
  provider: z.enum(POST_APPLICATION_PROVIDERS).default("gmail"),
  accountKey: z.string().min(1).max(255).default("default"),
  decidedBy: z.string().max(255).optional(),
});

const bulkActionBodySchema = z.object({
  action: z.enum(["approve", "deny"]),
  provider: z.enum(POST_APPLICATION_PROVIDERS).default("gmail"),
  accountKey: z.string().min(1).max(255).default("default"),
  decidedBy: z.string().max(255).optional(),
});

export const postApplicationReviewRouter = Router();

postApplicationReviewRouter.get(
  "/inbox",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const items = await listPostApplicationInbox({
        provider: query.provider,
        accountKey: query.accountKey,
        ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
      });
      ok(res, { items, total: items.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);

postApplicationReviewRouter.get(
  "/runs",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const runs = await listPostApplicationReviewRuns({
        provider: query.provider,
        accountKey: query.accountKey,
        ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
      });
      ok(res, { runs, total: runs.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);

postApplicationReviewRouter.get(
  "/runs/:runId/messages",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const { runId } = runParamsSchema.parse(req.params);
      const result = await listPostApplicationRunMessages({
        provider: query.provider,
        accountKey: query.accountKey,
        runId,
        ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
      });
      ok(res, {
        run: result.run,
        items: result.items,
        total: result.items.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);

postApplicationReviewRouter.post(
  "/inbox/:messageId/approve",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const { messageId } = inboxParamsSchema.parse(req.params);
      const input = approveBodySchema.parse(req.body ?? {});

      const result = await approvePostApplicationInboxItem({
        messageId,
        provider: input.provider,
        accountKey: input.accountKey,
        jobId: input.jobId,
        stageTarget: input.stageTarget,
        toStage: input.toStage,
        note: input.note,
        decidedBy: input.decidedBy ?? null,
      });

      ok(res, result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);

postApplicationReviewRouter.post(
  "/inbox/:messageId/deny",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const { messageId } = inboxParamsSchema.parse(req.params);
      const input = denyBodySchema.parse(req.body ?? {});

      const result = await denyPostApplicationInboxItem({
        messageId,
        provider: input.provider,
        accountKey: input.accountKey,
        decidedBy: input.decidedBy ?? null,
      });

      ok(res, result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);

postApplicationReviewRouter.post(
  "/inbox/bulk",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const input = bulkActionBodySchema.parse(req.body ?? {});

      const result = await bulkPostApplicationInboxAction({
        action: input.action,
        provider: input.provider,
        accountKey: input.accountKey,
        decidedBy: input.decidedBy ?? null,
      });

      ok(res, result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        fail(res, badRequest(error.message, error.flatten()));
        return;
      }
      throw error;
    }
  }),
);
