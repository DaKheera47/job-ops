import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { runPipeline } from "../pipeline/orchestrator";
import * as settingsRepo from "../repositories/settings";
import { createScheduler, type Scheduler } from "../utils/scheduler";

let scheduler: Scheduler | null = null;

async function runScheduledPipeline(): Promise<void> {
  logger.info("Scheduled pipeline run starting");

  const topN = parseInt(
    (await settingsRepo.getSetting("pipelineTopN")) || "10",
    10,
  );
  const minScore = parseInt(
    (await settingsRepo.getSetting("pipelineMinScore")) || "50",
    10,
  );

  await runWithRequestContext({ pipelineRunId: "scheduled" }, async () => {
    const result = await runPipeline({
      topN: Number.isNaN(topN) ? 10 : topN,
      minSuitabilityScore: Number.isNaN(minScore) ? 50 : minScore,
    });

    if (result.success) {
      logger.info("Scheduled pipeline completed", {
        jobsDiscovered: result.jobsDiscovered,
        jobsProcessed: result.jobsProcessed,
      });
    } else {
      logger.warn("Scheduled pipeline failed", { error: result.error });
    }
  });
}

export async function initializePipelineScheduler(): Promise<void> {
  if (!scheduler) {
    scheduler = createScheduler("pipeline", runScheduledPipeline);
  }

  const enabled = await settingsRepo.getSetting("pipelineScheduleEnabled");
  const hourRaw = await settingsRepo.getSetting("pipelineScheduleHour");
  const hour = parseInt(hourRaw || "8", 10);
  const safeHour = Number.isNaN(hour) ? 8 : Math.min(23, Math.max(0, hour));

  if (enabled === "true" || enabled === "1") {
    scheduler.start(safeHour);
    logger.info("Pipeline scheduler started", { hour: safeHour });
  } else {
    scheduler.stop();
    logger.info("Pipeline scheduler disabled");
  }
}

export function getPipelineSchedulerStatus(): {
  enabled: boolean;
  nextRun: string | null;
} {
  return {
    enabled: scheduler?.isRunning() ?? false,
    nextRun: scheduler?.getNextRun() ?? null,
  };
}
