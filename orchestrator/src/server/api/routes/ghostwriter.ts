import { asyncRoute, fail, ok } from "@infra/http";
import { runWithRequestContext } from "@infra/request-context";
import { setupSse, writeSseData } from "@infra/sse";
import { badRequest, toAppError } from "@server/infra/errors";
import { type Request, Router } from "express";
import { z } from "zod";
import * as ghostwriterService from "../../services/ghostwriter";

export const ghostwriterRouter = Router({ mergeParams: true });

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

ghostwriterRouter.get(
  "/messages",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const parsed = listMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      const messages = await ghostwriterService.listMessagesForJob({
        jobId,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      ok(res, { messages });
    });
  }),
);

ghostwriterRouter.post(
  "/messages",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(
        res,
        badRequest(parsed.error.message, parsed.error.flatten()),
      );
    }

    await runWithRequestContext({ jobId }, async () => {
      if (parsed.data.stream) {
        setupSse(res, {
          cacheControl: "no-cache, no-transform",
          flushHeaders: true,
        });

        try {
          await ghostwriterService.sendMessageForJob({
            jobId,
            content: parsed.data.content,
            stream: {
              onReady: ({ runId, threadId, messageId, requestId }) =>
                writeSseData(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSseData(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSseData(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSseData(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSseData(res, {
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
          writeSseData(res, {
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

      const result = await ghostwriterService.sendMessageForJob({
        jobId,
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

ghostwriterRouter.post(
  "/runs/:runId/cancel",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const runId = req.params.runId;
    if (!runId) {
      return fail(res, badRequest("Missing run id"));
    }

    await runWithRequestContext({ jobId }, async () => {
      const result = await ghostwriterService.cancelRunForJob({
        jobId,
        runId,
      });

      ok(res, result);
    });
  }),
);

ghostwriterRouter.post(
  "/messages/:assistantMessageId/regenerate",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const assistantMessageId = req.params.assistantMessageId;
    if (!assistantMessageId) {
      return fail(res, badRequest("Missing message id"));
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
        setupSse(res, {
          cacheControl: "no-cache, no-transform",
          flushHeaders: true,
        });

        try {
          await ghostwriterService.regenerateMessageForJob({
            jobId,
            assistantMessageId,
            stream: {
              onReady: ({ runId, threadId, messageId, requestId }) =>
                writeSseData(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSseData(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSseData(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSseData(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSseData(res, {
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
          writeSseData(res, {
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

      const result = await ghostwriterService.regenerateMessageForJob({
        jobId,
        assistantMessageId,
      });

      ok(res, result);
    });
  }),
);

ghostwriterRouter.get(
  "/threads",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);

    await runWithRequestContext({ jobId }, async () => {
      const threads = await ghostwriterService.listThreads(jobId);
      ok(res, { threads });
    });
  }),
);

ghostwriterRouter.post(
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
      const thread = await ghostwriterService.createThread({
        jobId,
        title: parsed.data.title,
      });
      ok(res, { thread }, 201);
    });
  }),
);

ghostwriterRouter.get(
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
      const messages = await ghostwriterService.listMessages({
        jobId,
        threadId,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      ok(res, { messages });
    });
  }),
);

ghostwriterRouter.post(
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
        setupSse(res, {
          cacheControl: "no-cache, no-transform",
          flushHeaders: true,
        });

        try {
          await ghostwriterService.sendMessage({
            jobId,
            threadId,
            content: parsed.data.content,
            stream: {
              onReady: ({ runId, messageId, requestId }) =>
                writeSseData(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSseData(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSseData(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSseData(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSseData(res, {
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
          writeSseData(res, {
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

      const result = await ghostwriterService.sendMessage({
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

ghostwriterRouter.post(
  "/threads/:threadId/runs/:runId/cancel",
  asyncRoute(async (req, res) => {
    const jobId = getJobId(req);
    const threadId = req.params.threadId;
    const runId = req.params.runId;

    if (!threadId || !runId) {
      return fail(res, badRequest("Missing thread id or run id"));
    }

    await runWithRequestContext({ jobId }, async () => {
      const result = await ghostwriterService.cancelRun({
        jobId,
        threadId,
        runId,
      });

      ok(res, result);
    });
  }),
);

ghostwriterRouter.post(
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
        setupSse(res, {
          cacheControl: "no-cache, no-transform",
          flushHeaders: true,
        });

        try {
          await ghostwriterService.regenerateMessage({
            jobId,
            threadId,
            assistantMessageId,
            stream: {
              onReady: ({ runId, messageId, requestId }) =>
                writeSseData(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                }),
              onDelta: ({ runId, messageId, delta }) =>
                writeSseData(res, {
                  type: "delta",
                  runId,
                  messageId,
                  delta,
                }),
              onCompleted: ({ runId, message }) =>
                writeSseData(res, {
                  type: "completed",
                  runId,
                  message,
                }),
              onCancelled: ({ runId, message }) =>
                writeSseData(res, {
                  type: "cancelled",
                  runId,
                  message,
                }),
              onError: ({ runId, code, message, requestId }) =>
                writeSseData(res, {
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
          writeSseData(res, {
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

      const result = await ghostwriterService.regenerateMessage({
        jobId,
        threadId,
        assistantMessageId,
      });

      ok(res, result);
    });
  }),
);
