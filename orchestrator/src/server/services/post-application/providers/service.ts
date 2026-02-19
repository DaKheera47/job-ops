import { logger } from "@infra/logger";
import type { PostApplicationProviderActionResponse } from "@shared/types";
import { toProviderAppError } from "./errors";
import { resolvePostApplicationProvider } from "./registry";
import type {
  ExecutePostApplicationProviderActionInput,
  PostApplicationProviderActionResult,
} from "./types";

export async function executePostApplicationProviderAction(
  input: ExecutePostApplicationProviderActionInput,
): Promise<PostApplicationProviderActionResponse> {
  const provider = resolvePostApplicationProvider(input.provider);

  try {
    let result: PostApplicationProviderActionResult;
    switch (input.action) {
      case "connect":
        result = await provider.connect({
          accountKey: input.accountKey,
          initiatedBy: input.initiatedBy,
          payload: input.connectPayload,
        });
        break;
      case "status":
        result = await provider.status({
          accountKey: input.accountKey,
        });
        break;
      case "sync":
        result = await provider.sync({
          accountKey: input.accountKey,
          initiatedBy: input.initiatedBy,
          payload: input.syncPayload,
        });
        break;
      case "disconnect":
        result = await provider.disconnect({
          accountKey: input.accountKey,
          initiatedBy: input.initiatedBy,
        });
        break;
    }

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
