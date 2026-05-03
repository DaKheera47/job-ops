import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { jobs } from "../../db/schema";
import { getActiveTenantId } from "@server/tenancy/context";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  weekCount: number;
  totalApplied: number;
  isActiveToday: boolean;
  streakAtRisk: boolean;
}

function toLocalDateStr(date: Date, tz: string): string {
  try {
    return date.toLocaleDateString("en-CA", { timeZone: tz }); // "2026-05-01"
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export async function getStreakData(timezone = "Europe/Berlin"): Promise<StreakData> {
  const tenantId = getActiveTenantId();

  const rows = await db
    .select({ appliedAt: jobs.appliedAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        inArray(jobs.status, ["applied", "in_progress"]),
        sql`${jobs.appliedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(jobs.appliedAt));

  if (rows.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      todayCount: 0,
      weekCount: 0,
      totalApplied: 0,
      isActiveToday: false,
      streakAtRisk: false,
    };
  }

  const now = new Date();
  const todayStr = toLocalDateStr(now, timezone);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterdayDate, timezone);

  // Week boundary
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Collect unique applied days + counts
  const daySet = new Set<string>();
  let todayCount = 0;
  let weekCount = 0;

  for (const row of rows) {
    if (!row.appliedAt) continue;
    const d = new Date(row.appliedAt);
    const dayStr = toLocalDateStr(d, timezone);
    daySet.add(dayStr);

    if (dayStr === todayStr) todayCount++;
    if (d >= weekAgo) weekCount++;
  }

  const totalApplied = rows.length;
  const isActiveToday = todayCount > 0;

  // Sort days descending
  const sortedDays = Array.from(daySet).sort().reverse();

  // Calculate current streak
  let currentStreak = 0;
  const checkDate = new Date(now);

  // If not active today, start checking from yesterday
  if (!isActiveToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 400; i++) {
    const checkStr = toLocalDateStr(checkDate, timezone);
    if (daySet.has(checkStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // If not active today but was yesterday, streak is "at risk" (still counting yesterday)
  const streakAtRisk = !isActiveToday && daySet.has(yesterdayStr);

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffMs = prev.getTime() - curr.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    todayCount,
    weekCount,
    totalApplied,
    isActiveToday,
    streakAtRisk,
  };
}
