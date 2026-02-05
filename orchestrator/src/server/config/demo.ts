import { AppError } from "@infra/errors";
import { fail } from "@infra/http";
import { logger } from "@infra/logger";
import type { DemoInfoResponse } from "@shared/types";
import type { Response } from "express";

export const DEMO_RESET_CADENCE_HOURS = 6;

type DemoState = {
  lastResetAt: string | null;
  nextResetAt: string | null;
};

const state: DemoState = {
  lastResetAt: null,
  nextResetAt: null,
};

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getDemoInfo(): DemoInfoResponse {
  return {
    demoMode: isDemoMode(),
    resetCadenceHours: DEMO_RESET_CADENCE_HOURS,
    lastResetAt: state.lastResetAt,
    nextResetAt: state.nextResetAt,
  };
}

export function setDemoResetTimes(args: {
  lastResetAt?: string | null;
  nextResetAt?: string | null;
}): void {
  if (args.lastResetAt !== undefined) state.lastResetAt = args.lastResetAt;
  if (args.nextResetAt !== undefined) state.nextResetAt = args.nextResetAt;
}

export function makeDemoMeta(options?: {
  simulated?: boolean;
  blockedReason?: string;
}): { simulated?: boolean; blockedReason?: string } {
  return {
    ...(options?.simulated ? { simulated: true } : {}),
    ...(options?.blockedReason
      ? { blockedReason: options.blockedReason }
      : {}),
  };
}

export function sendDemoBlocked(
  res: Response,
  blockedReason: string,
  context: Record<string, unknown> = {},
): void {
  logger.info("Blocked action in demo mode", {
    blockedReason,
    ...context,
  });
  fail(
    res,
    new AppError({
      status: 403,
      code: "FORBIDDEN",
      message: "This action is disabled in the public demo.",
      details: { blockedReason },
    }),
    { blockedReason },
  );
}
