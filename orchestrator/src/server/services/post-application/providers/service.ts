import { logger } from "@infra/logger";
import type { PostApplicationProviderActionResponse } from "@shared/types";
import { toProviderAppError } from "./errors";
import { resolvePostApplicationProvider } from "./registry";
import type { ExecutePostApplicationProviderActionInput } from "./types";

export async function executePostApplicationProviderAction(
  input: ExecutePostApplicationProviderActionInput,
): Promise<PostApplicationProviderActionResponse> {
  const provider = resolvePostApplicationProvider(input.provider);

  try {
    const result =
      input.action === "connect"
        ? await provider.connect({
            accountKey: input.accountKey,
            initiatedBy: input.initiatedBy,
            payload: input.connectPayload,
          })
        : input.action === "status"
          ? await provider.status({
              accountKey: input.accountKey,
            })
          : input.action === "sync"
            ? await provider.sync({
                accountKey: input.accountKey,
                initiatedBy: input.initiatedBy,
                payload: input.syncPayload,
              })
            : await provider.disconnect({
                accountKey: input.accountKey,
                initiatedBy: input.initiatedBy,
              });

    return {
      provider: provider.key,
      action: input.action,
      accountKey: input.accountKey,
      status: result.status,
      ...(result.message ? { message: result.message } : {}),
    };
  } catch (error) {
    logger.warn("Post-application provider action failed", {
      provider: provider.key,
      action: input.action,
      accountKey: input.accountKey,
      initiatedBy: input.initiatedBy ?? null,
      error,
    });
    throw toProviderAppError(error);
  }
}
