import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { format } from "node:util";
import Database from "better-sqlite3";

type Scenario = {
  label: string;
  path: string;
};

type RouteBenchmarkMeta = {
  route: string;
  view: "list" | "full";
  statusFilter: string | null;
  returnedCount: number;
  duplicateMatchingEnabled: boolean;
  candidateCount: number;
  totalMs: number;
  queryParseMs: number;
  primaryQueryMs: number;
  duplicateCandidatesQueryMs: number;
  duplicateMatchCpuMs: number;
  statsAggregateMs: number;
  revisionAggregateMs: number;
  internalRouteMs: number;
};

type ParsedLogLine = {
  msg?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
};

type RequestMetrics = RouteBenchmarkMeta & {
  requestId: string;
  scenario: string;
  httpDurationMs: number;
  serializeAndWriteMs: number;
};

type MetricSummary = {
  mean: number;
  p50: number;
  p95: number;
};

type ScenarioSummary = {
  scenario: string;
  requests: number;
  totals: MetricSummary;
  internalRoute: MetricSummary;
  queryParse: MetricSummary;
  primaryQuery: MetricSummary;
  duplicateCandidates: MetricSummary;
  duplicateMatchCpu: MetricSummary;
  stats: MetricSummary;
  revision: MetricSummary;
  serializeAndWrite: MetricSummary;
  slowestPhase: string;
  phasePercentOfTotal: Record<string, number>;
};

const WARMUP_REQUESTS = Number.parseInt(
  process.env.JOBS_BENCH_WARMUP_REQUESTS ?? "3",
  10,
);
const MEASURED_REQUESTS = Number.parseInt(
  process.env.JOBS_BENCH_REQUESTS ?? "10",
  10,
);
const scenarios: Scenario[] = [
  { label: "list", path: "/api/jobs?view=list" },
  { label: "full", path: "/api/jobs?view=full" },
  {
    label: "list_status_applied_in_progress",
    path: "/api/jobs?view=list&status=applied,in_progress",
  },
];

function resolveSourceDataDir(cwd: string): string {
  const fromEnv = (process.env.DATA_DIR || "").trim();
  if (fromEnv) return resolve(fromEnv);

  const cwdBase = basename(cwd);
  const parentDir = resolve(cwd, "..");
  const candidates =
    cwdBase === "orchestrator"
      ? [join(parentDir, "data"), join(cwd, "data")]
      : [join(cwd, "data"), join(parentDir, "data")];

  return resolve(candidates[0]);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function summarize(values: number[]): MetricSummary {
  if (values.length === 0) {
    return { mean: 0, p50: 0, p95: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    mean: total / values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function toJsonLine(args: unknown[]): string {
  return format(...args);
}

function parseLogLines(lines: string[]): ParsedLogLine[] {
  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];

    try {
      return [JSON.parse(trimmed) as ParsedLogLine];
    } catch {
      return [];
    }
  });
}

async function createDbSnapshot(
  sourceDbPath: string,
  destinationDbPath: string,
) {
  const sourceDb = new Database(sourceDbPath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    await sourceDb.backup(destinationDbPath);
  } finally {
    sourceDb.close();
  }
}

function installConsoleCapture() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    lines.push(toJsonLine(args));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(toJsonLine(args));
  };
  console.error = (...args: unknown[]) => {
    lines.push(toJsonLine(args));
  };

  return {
    lines,
    restore() {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

function findRequestMetrics(
  parsedLogs: ParsedLogLine[],
  requestIdToScenario: Map<string, string>,
): RequestMetrics[] {
  const routeLogs = new Map<string, RouteBenchmarkMeta>();
  const httpLogs = new Map<string, number>();

  for (const line of parsedLogs) {
    if (!line.requestId) continue;

    if (line.msg === "Jobs list benchmark" && line.meta) {
      routeLogs.set(line.requestId, line.meta as unknown as RouteBenchmarkMeta);
    }

    if (line.msg === "HTTP request completed" && line.meta) {
      const durationMs = Number(line.meta.durationMs ?? 0);
      if (Number.isFinite(durationMs)) {
        httpLogs.set(line.requestId, durationMs);
      }
    }
  }

  return Array.from(requestIdToScenario.entries()).map(
    ([requestId, scenario]) => {
      const routeMeta = routeLogs.get(requestId);
      const httpDurationMs = httpLogs.get(requestId);

      if (!routeMeta) {
        throw new Error(`Missing benchmark log for request ${requestId}`);
      }

      if (httpDurationMs === undefined) {
        throw new Error(`Missing HTTP duration log for request ${requestId}`);
      }

      return {
        ...routeMeta,
        requestId,
        scenario,
        httpDurationMs,
        serializeAndWriteMs: Math.max(
          0,
          httpDurationMs - routeMeta.internalRouteMs,
        ),
      };
    },
  );
}

function summarizeScenario(metrics: RequestMetrics[]): ScenarioSummary {
  const phaseMeans = {
    queryParse: summarize(metrics.map((entry) => entry.queryParseMs)).mean,
    primaryQuery: summarize(metrics.map((entry) => entry.primaryQueryMs)).mean,
    duplicateCandidates: summarize(
      metrics.map((entry) => entry.duplicateCandidatesQueryMs),
    ).mean,
    duplicateMatchCpu: summarize(
      metrics.map((entry) => entry.duplicateMatchCpuMs),
    ).mean,
    stats: summarize(metrics.map((entry) => entry.statsAggregateMs)).mean,
    revision: summarize(metrics.map((entry) => entry.revisionAggregateMs)).mean,
    serializeAndWrite: summarize(
      metrics.map((entry) => entry.serializeAndWriteMs),
    ).mean,
  };
  const slowestPhase =
    Object.entries(phaseMeans).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? "unknown";
  const totalMean = summarize(
    metrics.map((entry) => entry.httpDurationMs),
  ).mean;

  return {
    scenario: metrics[0]?.scenario ?? "unknown",
    requests: metrics.length,
    totals: summarize(metrics.map((entry) => entry.httpDurationMs)),
    internalRoute: summarize(metrics.map((entry) => entry.internalRouteMs)),
    queryParse: summarize(metrics.map((entry) => entry.queryParseMs)),
    primaryQuery: summarize(metrics.map((entry) => entry.primaryQueryMs)),
    duplicateCandidates: summarize(
      metrics.map((entry) => entry.duplicateCandidatesQueryMs),
    ),
    duplicateMatchCpu: summarize(
      metrics.map((entry) => entry.duplicateMatchCpuMs),
    ),
    stats: summarize(metrics.map((entry) => entry.statsAggregateMs)),
    revision: summarize(metrics.map((entry) => entry.revisionAggregateMs)),
    serializeAndWrite: summarize(
      metrics.map((entry) => entry.serializeAndWriteMs),
    ),
    slowestPhase,
    phasePercentOfTotal: Object.fromEntries(
      Object.entries(phaseMeans).map(([phase, mean]) => [
        phase,
        totalMean > 0 ? Number(((mean / totalMean) * 100).toFixed(2)) : 0,
      ]),
    ),
  };
}

function renderTable(summaries: ScenarioSummary[]): string {
  const rows = summaries.map((summary) => ({
    scenario: summary.scenario,
    requests: String(summary.requests),
    "total mean": formatMs(summary.totals.mean),
    "total p95": formatMs(summary.totals.p95),
    "primary query": formatMs(summary.primaryQuery.mean),
    "dup candidates": formatMs(summary.duplicateCandidates.mean),
    "dup match cpu": formatMs(summary.duplicateMatchCpu.mean),
    stats: formatMs(summary.stats.mean),
    revision: formatMs(summary.revision.mean),
    "serialize/write": formatMs(summary.serializeAndWrite.mean),
    "slowest phase": summary.slowestPhase,
  }));
  const headers = Object.keys(
    rows[0] ?? {
      scenario: "",
      requests: "",
      "total mean": "",
      "total p95": "",
      "primary query": "",
      "dup candidates": "",
      "dup match cpu": "",
      stats: "",
      revision: "",
      "serialize/write": "",
      "slowest phase": "",
    },
  );
  const widths = headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[header as keyof typeof row].length),
    ),
  );
  const formatRow = (values: string[]) =>
    values
      .map((value, index) => value.padEnd(widths[index] ?? value.length))
      .join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");

  return [
    formatRow(headers),
    divider,
    ...rows.map((row) =>
      formatRow(headers.map((header) => row[header as keyof typeof row])),
    ),
  ].join("\n");
}

async function main() {
  const cwd = process.cwd();
  const liveDataDir = resolveSourceDataDir(cwd);
  const liveDbPath = join(liveDataDir, "jobs.db");
  const tempDataDir = await mkdtemp(join(tmpdir(), "job-ops-bench-"));
  const tempDbPath = join(tempDataDir, "jobs.db");

  let restoreConsole: (() => void) | null = null;
  let closeDb: (() => void) | null = null;
  let server: import("node:http").Server | null = null;

  try {
    await createDbSnapshot(liveDbPath, tempDbPath);

    process.env.DATA_DIR = tempDataDir;
    process.env.BENCHMARK_JOBS_TIMING = "1";

    await import("@server/db/migrate");
    const { applyStoredEnvOverrides } = await import(
      "@server/services/envSettings"
    );
    await applyStoredEnvOverrides();
    const { createApp } = await import("@server/app");
    ({ closeDb } = await import("@server/db/index"));

    const app = createApp();
    server = await new Promise<import("node:http").Server>((resolveServer) => {
      const nextServer = app.listen(0, () => resolveServer(nextServer));
    });

    const capture = installConsoleCapture();
    restoreConsole = capture.restore;
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve benchmark server port");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const requestIdToScenario = new Map<string, string>();

    for (const scenario of scenarios) {
      for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
        const requestId = `jobs-bench-warmup-${scenario.label}-${index}`;
        const response = await fetch(`${baseUrl}${scenario.path}`, {
          headers: { "x-request-id": requestId },
        });
        if (!response.ok) {
          throw new Error(
            `Warmup request failed for ${scenario.label}: ${response.status}`,
          );
        }
        await response.text();
      }

      for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
        const requestId = `jobs-bench-${scenario.label}-${index}`;
        requestIdToScenario.set(requestId, scenario.label);
        const response = await fetch(`${baseUrl}${scenario.path}`, {
          headers: { "x-request-id": requestId },
        });
        if (!response.ok) {
          throw new Error(
            `Benchmark request failed for ${scenario.label}: ${response.status}`,
          );
        }
        await response.text();
      }
    }

    await new Promise((resolveTick) => setTimeout(resolveTick, 0));

    restoreConsole();
    restoreConsole = null;

    const parsedLogs = parseLogLines(capture.lines);
    const metrics = findRequestMetrics(parsedLogs, requestIdToScenario);
    const summaries = Array.from(
      metrics.reduce((map, metric) => {
        const bucket = map.get(metric.scenario) ?? [];
        bucket.push(metric);
        map.set(metric.scenario, bucket);
        return map;
      }, new Map<string, RequestMetrics[]>()),
    )
      .map(([, scenarioMetrics]) => summarizeScenario(scenarioMetrics))
      .sort((left, right) => left.scenario.localeCompare(right.scenario));

    console.log(`Source DB: ${liveDbPath}`);
    console.log(`Snapshot DB: ${tempDbPath}`);
    console.log(
      `Warmup requests: ${WARMUP_REQUESTS}, measured requests: ${MEASURED_REQUESTS}`,
    );
    console.log("");
    console.log(renderTable(summaries));
    console.log("");
    console.log(
      JSON.stringify(
        {
          sourceDbPath: liveDbPath,
          snapshotDbPath: tempDbPath,
          warmupRequests: WARMUP_REQUESTS,
          measuredRequests: MEASURED_REQUESTS,
          summaries,
        },
        null,
        2,
      ),
    );
  } finally {
    if (restoreConsole) restoreConsole();

    if (server) {
      await new Promise<void>((resolveClose) =>
        server?.close(() => resolveClose()),
      );
    }
    closeDb?.();
    await rm(tempDataDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
