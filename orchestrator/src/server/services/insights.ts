/**
 * Insights service — outcome-driven feedback loop. Mines the local DB to:
 *   1. Compute applied-stage funnel metrics over the last N days.
 *   2. Compute response/interview/offer conversion from stage_events.
 *   3. Surface most-frequent missing skills from match_analysis to flag
 *      training opportunities.
 *   4. Recommend a score floor based on actual conversion at each band.
 *
 * No LLM calls — pure SQL + aggregation. Cheap to run on every /insights.
 */

import type {
  ApplicationStage,
  JobLegitimacyTier,
  JobMatchAnalysis,
  PipelineRunFunnelMetrics,
} from "@shared/types";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { jobs, pipelineRuns, stageEvents } = schema;

const DEFAULT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ConversionStage {
  stage: ApplicationStage | "applied";
  count: number;
  rate: number; // 0..1, fraction of "applied" that reached this stage
}

export interface MissingSkillSummary {
  skill: string;
  appearedIn: number; // # of jobs the skill was missing in
}

export interface ScoreBandConversion {
  band: string; // e.g. "80-100"
  applied: number;
  responded: number;
  rate: number;
}

export interface PipelineFunnelTotals
  extends Omit<PipelineRunFunnelMetrics, never> {
  runs: number;
}

export interface InsightsReport {
  windowDays: number;
  generatedAt: string;
  totals: {
    discoveredAt: number;
    appliedAt: number;
    inProgressAt: number;
    skippedAt: number;
    expiredAt: number;
    readyAt: number;
  };
  pipelineFunnel: PipelineFunnelTotals;
  conversion: ConversionStage[];
  scoreBands: ScoreBandConversion[];
  topMissingSkills: MissingSkillSummary[];
  ghostJobsFlagged: number;
  recommendations: string[];
}

const SCORE_BANDS: Array<[number, number, string]> = [
  [80, 100, "80-100"],
  [70, 79, "70-79"],
  [60, 69, "60-69"],
  [50, 59, "50-59"],
  [0, 49, "0-49"],
];

const RESPONSE_STAGES = new Set<ApplicationStage>([
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
]);

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

function daysAgoUnix(days: number): number {
  return Math.floor((Date.now() - days * MS_PER_DAY) / 1000);
}

/**
 * Get insights for the active tenant over the trailing N days.
 */
export async function getInsightsReport(
  options?: { windowDays?: number },
): Promise<InsightsReport> {
  const windowDays = options?.windowDays ?? DEFAULT_DAYS;
  const tenantId = getActiveTenantId();
  const sinceIso = daysAgoIso(windowDays);
  const sinceUnix = daysAgoUnix(windowDays);

  const [
    statusCountsRow,
    pipelineFunnelRow,
    appliedJobsRows,
    stageRows,
    matchAnalysisRows,
    ghostFlaggedRow,
  ] = await Promise.all([
    db
      .select({ status: jobs.status, count: sql<number>`count(*)` })
      .from(jobs)
      .where(
        and(eq(jobs.tenantId, tenantId), gte(jobs.discoveredAt, sinceIso)),
      )
      .groupBy(jobs.status),
    db
      .select({
        runs: sql<number>`count(*)`,
        searched: sql<number>`coalesce(sum(${pipelineRuns.jobsSearched}), 0)`,
        deduplicated: sql<number>`coalesce(sum(${pipelineRuns.jobsDeduplicated}), 0)`,
        livenessFiltered: sql<number>`coalesce(sum(${pipelineRuns.jobsLivenessFiltered}), 0)`,
        expired: sql<number>`coalesce(sum(${pipelineRuns.jobsExpired}), 0)`,
        scored: sql<number>`coalesce(sum(${pipelineRuns.jobsScored}), 0)`,
        autoSkipped: sql<number>`coalesce(sum(${pipelineRuns.jobsAutoSkipped}), 0)`,
        selected: sql<number>`coalesce(sum(${pipelineRuns.jobsSelected}), 0)`,
        ghostFlagged: sql<number>`coalesce(sum(${pipelineRuns.jobsGhostFlagged}), 0)`,
      })
      .from(pipelineRuns)
      .where(
        and(
          eq(pipelineRuns.tenantId, tenantId),
          gte(pipelineRuns.startedAt, sinceIso),
        ),
      ),
    db
      .select({
        id: jobs.id,
        suitabilityScore: jobs.suitabilityScore,
        appliedAt: jobs.appliedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.tenantId, tenantId),
          gte(jobs.appliedAt, sinceIso),
        ),
      ),
    db
      .select({
        applicationId: stageEvents.applicationId,
        toStage: stageEvents.toStage,
      })
      .from(stageEvents)
      .where(
        and(
          eq(stageEvents.tenantId, tenantId),
          gte(stageEvents.occurredAt, sinceUnix),
        ),
      ),
    db
      .select({
        matchAnalysis: jobs.matchAnalysis,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.tenantId, tenantId),
          gte(jobs.discoveredAt, sinceIso),
          sql`${jobs.matchAnalysis} IS NOT NULL`,
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.tenantId, tenantId),
          gte(jobs.discoveredAt, sinceIso),
          eq(jobs.legitimacyTier, "red" as JobLegitimacyTier),
        ),
      ),
  ]);

  // Status counts
  const totals = {
    discoveredAt: 0,
    appliedAt: 0,
    inProgressAt: 0,
    skippedAt: 0,
    expiredAt: 0,
    readyAt: 0,
  };
  for (const row of statusCountsRow) {
    if (row.status === "discovered") totals.discoveredAt = row.count;
    else if (row.status === "applied") totals.appliedAt = row.count;
    else if (row.status === "in_progress") totals.inProgressAt = row.count;
    else if (row.status === "skipped") totals.skippedAt = row.count;
    else if (row.status === "expired") totals.expiredAt = row.count;
    else if (row.status === "ready") totals.readyAt = row.count;
  }

  // Pipeline funnel
  const pipelineFunnelRaw = pipelineFunnelRow[0] ?? {
    runs: 0,
    searched: 0,
    deduplicated: 0,
    livenessFiltered: 0,
    expired: 0,
    scored: 0,
    autoSkipped: 0,
    selected: 0,
    ghostFlagged: 0,
  };
  const pipelineFunnel: PipelineFunnelTotals = {
    runs: pipelineFunnelRaw.runs,
    searched: pipelineFunnelRaw.searched,
    deduplicated: pipelineFunnelRaw.deduplicated,
    livenessFiltered: pipelineFunnelRaw.livenessFiltered,
    expired: pipelineFunnelRaw.expired,
    scored: pipelineFunnelRaw.scored,
    autoSkipped: pipelineFunnelRaw.autoSkipped,
    selected: pipelineFunnelRaw.selected,
    ghostFlagged: pipelineFunnelRaw.ghostFlagged,
  };

  // Conversion: jobs that applied vs jobs that hit each downstream stage.
  const appliedIds = new Set(
    appliedJobsRows.filter((row) => row.appliedAt).map((row) => row.id),
  );
  const reachedByStage: Record<ApplicationStage, Set<string>> = {
    applied: new Set(appliedIds),
    recruiter_screen: new Set(),
    assessment: new Set(),
    hiring_manager_screen: new Set(),
    technical_interview: new Set(),
    onsite: new Set(),
    offer: new Set(),
    closed: new Set(),
  };
  for (const row of stageRows) {
    const stage = row.toStage as ApplicationStage;
    if (stage in reachedByStage) {
      reachedByStage[stage].add(row.applicationId);
    }
  }
  const appliedTotal = appliedIds.size;
  const conversion: ConversionStage[] = (
    [
      "applied",
      "recruiter_screen",
      "assessment",
      "hiring_manager_screen",
      "technical_interview",
      "onsite",
      "offer",
    ] as ApplicationStage[]
  ).map((stage) => {
    const count = reachedByStage[stage].size;
    return {
      stage,
      count,
      rate: appliedTotal > 0 ? count / appliedTotal : 0,
    };
  });

  // Score bands
  const scoreBands: ScoreBandConversion[] = SCORE_BANDS.map(
    ([min, max, label]) => {
      const inBand = appliedJobsRows.filter(
        (row) =>
          row.suitabilityScore !== null &&
          row.suitabilityScore >= min &&
          row.suitabilityScore <= max,
      );
      const responded = inBand.filter((row) => {
        for (const stage of RESPONSE_STAGES) {
          if (reachedByStage[stage].has(row.id)) return true;
        }
        return false;
      });
      return {
        band: label,
        applied: inBand.length,
        responded: responded.length,
        rate: inBand.length > 0 ? responded.length / inBand.length : 0,
      };
    },
  );

  // Missing skills frequency
  const missingSkillCounts = new Map<string, number>();
  for (const row of matchAnalysisRows) {
    const analysis = row.matchAnalysis as JobMatchAnalysis | null;
    if (!analysis?.skills) continue;
    for (const skill of analysis.skills.missing ?? []) {
      const normalized = skill.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      missingSkillCounts.set(key, (missingSkillCounts.get(key) ?? 0) + 1);
    }
  }
  const topMissingSkills: MissingSkillSummary[] = Array.from(
    missingSkillCounts.entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({
      skill: skill.replace(/\b\w/g, (c) => c.toUpperCase()),
      appearedIn: count,
    }));

  // Recommendations
  const recommendations = buildRecommendations({
    conversion,
    scoreBands,
    topMissingSkills,
    ghostJobs: ghostFlaggedRow[0]?.count ?? 0,
    appliedTotal,
  });

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    totals,
    pipelineFunnel,
    conversion,
    scoreBands,
    topMissingSkills,
    ghostJobsFlagged: ghostFlaggedRow[0]?.count ?? 0,
    recommendations,
  };
}

function buildRecommendations(args: {
  conversion: ConversionStage[];
  scoreBands: ScoreBandConversion[];
  topMissingSkills: MissingSkillSummary[];
  ghostJobs: number;
  appliedTotal: number;
}): string[] {
  const out: string[] = [];

  if (args.appliedTotal === 0) {
    out.push(
      "📭 No applications in the window. Try lowering autoSkip threshold, expanding sources, or running the pipeline more often.",
    );
    return out;
  }

  // Recommend score floor based on first band with ≥5 apps and ≥10% response.
  const significantBands = args.scoreBands.filter((b) => b.applied >= 5);
  if (significantBands.length >= 2) {
    const profitable = significantBands.find((b) => b.rate >= 0.1);
    if (profitable) {
      out.push(
        `🎯 Recommended score floor: ${profitable.band.split("-")[0]}+ (${(profitable.rate * 100).toFixed(0)}% response in this band over ${profitable.applied} apps).`,
      );
    }
    const underperforming = significantBands.filter((b) => b.rate < 0.05);
    if (underperforming.length > 0) {
      out.push(
        `⚠️ Score bands ${underperforming.map((b) => b.band).join(", ")} have <5% response — consider raising autoSkip threshold.`,
      );
    }
  }

  // Recruiter-screen rate
  const recruiterStage = args.conversion.find(
    (c) => c.stage === "recruiter_screen",
  );
  if (recruiterStage && args.appliedTotal >= 10) {
    if (recruiterStage.rate < 0.05) {
      out.push(
        `📉 Only ${(recruiterStage.rate * 100).toFixed(0)}% of applications got a recruiter screen — your resume or job-target may need adjustment.`,
      );
    } else if (recruiterStage.rate >= 0.2) {
      out.push(
        `🎉 Strong ${(recruiterStage.rate * 100).toFixed(0)}% recruiter-screen rate — keep doing what you're doing.`,
      );
    }
  }

  // Top missing skill
  if (args.topMissingSkills.length > 0) {
    const top = args.topMissingSkills[0];
    if (top.appearedIn >= 3) {
      out.push(
        `📚 "${top.skill}" was missing in ${top.appearedIn} jobs — consider learning it or adding to your skills section if you have related experience.`,
      );
    }
  }

  // Ghost jobs
  if (args.ghostJobs >= 5) {
    out.push(
      `👻 ${args.ghostJobs} listings were flagged as likely ghost jobs — they're auto-deprioritised in the pipeline.`,
    );
  }

  if (out.length === 0) {
    out.push(
      "✅ Not enough signal yet. Apply to ~10+ jobs to unlock data-driven recommendations.",
    );
  }

  return out;
}
