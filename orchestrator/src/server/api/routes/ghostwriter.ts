import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { badRequest, toAppError } from "@server/infra/errors";
import { type Request, type Response, Router } from "express";
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

function writeSse(res: Response, event: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function setupSseStream(
  req: Request,
  res: Response,
  onDisconnectRun?: (runId: string) => Promise<void>,
): {
  setRunId: (runId: string) => void;
  isClosed: () => boolean;
  cleanup: () => void;
} {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  let activeRunId: string | null = null;
  let disconnectHandled = false;

  const handleDisconnect = () => {
    if (disconnectHandled) return;
    disconnectHandled = true;
    if (!activeRunId || !onDisconnectRun) return;

    void onDisconnectRun(activeRunId).catch((error) => {
      logger.warn("Ghostwriter stream disconnect cancellation failed", {
        runId: activeRunId,
        error,
      });
    });
  };

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(": heartbeat\n\n");
  }, 30000);

  const onClose = () => {
    closed = true;
    clearInterval(heartbeat);
    handleDisconnect();
  };

  req.on("close", onClose);

  return {
    setRunId: (runId: string) => {
      activeRunId = runId;
      if (closed) {
        handleDisconnect();
      }
    },
    isClosed: () => closed,
    cleanup: () => {
      clearInterval(heartbeat);
      req.off("close", onClose);
    },
  };
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
        const sse = setupSseStream(req, res, async (runId: string) => {
          await ghostwriterService.cancelRunForJob({
            jobId,
            runId,
          });
        });

        try {
          await ghostwriterService.sendMessageForJob({
            jobId,
            content: parsed.data.content,
            stream: {
              onReady: ({ runId, threadId, messageId, requestId }) => {
                sse.setRunId(runId);
                if (sse.isClosed()) return;
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                });
              },
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
          sse.cleanup();
          if (!res.writableEnded) {
            res.end();
          }
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
        const sse = setupSseStream(req, res, async (runId: string) => {
          await ghostwriterService.cancelRunForJob({
            jobId,
            runId,
          });
        });

        try {
          await ghostwriterService.regenerateMessageForJob({
            jobId,
            assistantMessageId,
            stream: {
              onReady: ({ runId, threadId, messageId, requestId }) => {
                sse.setRunId(runId);
                if (sse.isClosed()) return;
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                });
              },
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
          sse.cleanup();
          if (!res.writableEnded) {
            res.end();
          }
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
        const sse = setupSseStream(req, res, async (runId: string) => {
          await ghostwriterService.cancelRun({
            jobId,
            threadId,
            runId,
          });
        });

        try {
          await ghostwriterService.sendMessage({
            jobId,
            threadId,
            content: parsed.data.content,
            stream: {
              onReady: ({ runId, messageId, requestId }) => {
                sse.setRunId(runId);
                if (sse.isClosed()) return;
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                });
              },
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
          sse.cleanup();
          if (!res.writableEnded) {
            res.end();
          }
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
        const sse = setupSseStream(req, res, async (runId: string) => {
          await ghostwriterService.cancelRun({
            jobId,
            threadId,
            runId,
          });
        });

        try {
          await ghostwriterService.regenerateMessage({
            jobId,
            threadId,
            assistantMessageId,
            stream: {
              onReady: ({ runId, messageId, requestId }) => {
                sse.setRunId(runId);
                if (sse.isClosed()) return;
                writeSse(res, {
                  type: "ready",
                  runId,
                  threadId,
                  messageId,
                  requestId,
                });
              },
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
          sse.cleanup();
          if (!res.writableEnded) {
            res.end();
          }
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
