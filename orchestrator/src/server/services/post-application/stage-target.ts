import type {
  ApplicationStage,
  JobOutcome,
  PostApplicationMessageType,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import { POST_APPLICATION_ROUTER_STAGE_TARGETS } from "@shared/types";

const STAGE_TARGET_VALUES = new Set<PostApplicationRouterStageTarget>(
  POST_APPLICATION_ROUTER_STAGE_TARGETS,
);

export function normalizeStageTarget(
  value: unknown,
): PostApplicationRouterStageTarget | null {
  if (typeof value !== "string") return null;
  return STAGE_TARGET_VALUES.has(value as PostApplicationRouterStageTarget)
    ? (value as PostApplicationRouterStageTarget)
    : null;
}

export function messageTypeFromStageTarget(
  target: PostApplicationRouterStageTarget,
): PostApplicationMessageType {
  if (
    target === "assessment" ||
    target === "hiring_manager_screen" ||
    target === "technical_interview" ||
    target === "onsite"
  ) {
    return "interview";
  }
  if (target === "offer") return "offer";
  if (target === "rejected" || target === "withdrawn" || target === "closed") {
    return "rejection";
  }
  if (target === "applied" || target === "recruiter_screen") return "update";
  return "other";
}

export function stageTargetFromMessageType(
  messageType: PostApplicationMessageType,
): PostApplicationRouterStageTarget {
  if (messageType === "interview") return "technical_interview";
  if (messageType === "offer") return "offer";
  if (messageType === "rejection") return "rejected";
  if (messageType === "update") return "recruiter_screen";
  return "no_change";
}

export function resolveStageTransitionForTarget(
  target: PostApplicationRouterStageTarget,
): {
  toStage: ApplicationStage | "no_change";
  outcome: JobOutcome | null;
  reasonCode: string | null;
} {
  if (target === "rejected") {
    return {
      toStage: "closed",
      outcome: "rejected",
      reasonCode: "rejected",
    };
  }
  if (target === "withdrawn") {
    return {
      toStage: "closed",
      outcome: "withdrawn",
      reasonCode: "withdrawn",
    };
  }
  if (target === "no_change") {
    return { toStage: "no_change", outcome: null, reasonCode: null };
  }

  return {
    toStage: target,
    outcome: null,
    reasonCode: null,
  };
}
