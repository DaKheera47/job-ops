import { asyncRoute, fail, ok } from "@infra/http";
import { runWithRequestContext } from "@infra/request-context";
import { badRequest, toAppError } from "@server/infra/errors";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import * as jobChatService from "../../services/job-chat";

export const jobChatRouter = Router({ mergeParams: true });

const createThreadSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  stream: z.boolean().optional(),
});

const regenerateSchema = z.object({
  stream: z.boolean().optional(),
});

function getJobId(req: Request): string {
  const jobId = req.params.id;
  if (!jobId) {
    throw badRequest("Missing job id");
  }
  return jobId;
}

function writeSse(res: Response, event: unknown): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

jobChatRouter.get(
  "/threads",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);

    await runWithRequestContext({ jobId }, async () => {
      const threads = await jobChatService.listThreads(jobId);
      ok(res, { threads });
    });
  }),
);

jobChatRouter.post(
  "/threads",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      const thread = await jobChatService.createThread({
        jobId,
        title: parsed.data.title,
      });
      ok(res, { thread }, 201);
    });
  }),
);

jobChatRouter.get(
  "/threads/:threadId/messages",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const threadId = req.params.threadId;
    if (!threadId) {
      return fail(res, badRequest("Missing thread id"));
    }

    const parsed = listMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      const messages = await jobChatService.listMessages({
        jobId,
        threadId,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      ok(res, { messages });
    });
  }),
);

jobChatRouter.post(
  "/threads/:threadId/messages",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const threadId = req.params.threadId;
    if (!threadId) {
      return fail(res, badRequest("Missing thread id"));
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      if (parsed.data.stream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        try {
          await jobChatService.sendMessage({
            jobId,
            threadId,
            content: parsed.data.content,
            stream: {
              onReady: ({ runId, messageId, requestId }) =>
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSse(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSse(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSse(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSse(res, {
                  type: "error",
                  runId,
                  code,
                  message,
                  requestId,
                }),
            },
          });
        } catch (error) {
          const appError = toAppError(error);
          writeSse(res, {
            type: "error",
            code: appError.code,
            message: appError.message,
            requestId: res.getHeader("x-request-id") || "unknown",
          });
        } finally {
          res.end();
        }

        return;
      }

      const result = await jobChatService.sendMessage({
        jobId,
        threadId,
        content: parsed.data.content,
      });

      ok(res, {
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        runId: result.runId,
      });
    });
  }),
);

jobChatRouter.post(
  "/threads/:threadId/runs/:runId/cancel",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const threadId = req.params.threadId;
    const runId = req.params.runId;

    if (!threadId || !runId) {
      return fail(res, badRequest("Missing thread id or run id"));
    }

    await runWithRequestContext({ jobId }, async () => {
      const result = await jobChatService.cancelRun({
        jobId,
        threadId,
        runId,
      });

      ok(res, result);
    });
  }),
);

jobChatRouter.post(
  "/threads/:threadId/messages/:assistantMessageId/regenerate",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const threadId = req.params.threadId;
    const assistantMessageId = req.params.assistantMessageId;

    if (!threadId || !assistantMessageId) {
      return fail(res, badRequest("Missing thread id or message id"));
    }

    const parsed = regenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      if (parsed.data.stream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        try {
          await jobChatService.regenerateMessage({
            jobId,
            threadId,
            assistantMessageId,
            stream: {
              onReady: ({ runId, messageId, requestId }) =>
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSse(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSse(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSse(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSse(res, {
                  type: "error",
                  runId,
                  code,
                  message,
                  requestId,
                }),
            },
          });
        } catch (error) {
          const appError = toAppError(error);
          writeSse(res, {
            type: "error",
            code: appError.code,
            message: appError.message,
            requestId: res.getHeader("x-request-id") || "unknown",
          });
        } finally {
          res.end();
        }

        return;
      }

      const result = await jobChatService.regenerateMessage({
        jobId,
        threadId,
        assistantMessageId,
      });

      ok(res, result);
    });
  }),
);
