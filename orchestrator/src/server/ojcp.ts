import { createHash } from "node:crypto";
import { logger } from "@infra/logger";
import { resolveRequestOrigin } from "@infra/request-origin";
import { sanitizeUnknown } from "@infra/sanitize";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { fetchFreeHirePage } from "../../../extractors/freehire/src/run.js";

const OJCP_VERSION = "0.1";
const OJCP_ERROR_CODE = -32000;
const OJCP_ID_PREFIX = "jobops:freehire:";
const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 1_000;
const SEARCH_CACHE_TTL_MS = 15_000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const SEARCH_CONCURRENCY = 10;
const FREEHIRE_TIMEOUT_MS = 5_000;

type VisaSponsorMatch = {
  exact_name_match: boolean;
  provider_id: string;
  matched_organisations?: string[];
};

type OjcpJob = CreateJobInput & {
  id: string;
  discoveredAt: string;
  visaSponsorMatch?: VisaSponsorMatch;
};

type CachedDetail = { expiresAt: number; job: OjcpJob };
type CachedSearch = {
  expiresAt: number;
  result: Record<string, unknown>;
};

const detailCache = new Map<string, CachedDetail>();
const searchCache = new Map<string, CachedSearch>();
const inFlightSearches = new Map<string, Promise<Record<string, unknown>>>();

const candidateContextSchema = z
  .object({
    consent_scope: z.array(z.string().trim().min(1)).min(1),
  })
  .passthrough();

const candidateContextInputSchema = {
  type: "object" as const,
  description:
    "Optional candidate context. Omit unless explicit consent scopes are available.",
  properties: {
    consent_scope: {
      type: "array" as const,
      items: { type: "string" as const, minLength: 1 },
      minItems: 1,
    },
  },
  required: ["consent_scope"],
  additionalProperties: true,
};

const searchJobsSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    location: z
      .object({
        city: z.string().trim().min(1).optional(),
        state: z.string().trim().min(1).optional(),
        country: z.string().trim().min(1).optional(),
        remote_ok: z.boolean().optional(),
        radius_miles: z.number().finite().positive().optional(),
      })
      .passthrough()
      .optional(),
    filters: z
      .object({
        employment_type: z.string().trim().min(1).optional(),
        salary_min: z.number().finite().optional(),
        salary_max: z.number().finite().optional(),
        experience_level: z.string().trim().min(1).optional(),
        posted_within_days: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    candidate_context: candidateContextSchema.optional(),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().nonnegative().default(0),
      })
      .passthrough()
      .default({ limit: 10, offset: 0 }),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (
      value.filters?.salary_min !== undefined &&
      value.filters.salary_max !== undefined &&
      value.filters.salary_min > value.filters.salary_max
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filters", "salary_min"],
        message: "salary_min must be less than or equal to salary_max",
      });
    }
  });

const getJobDetailSchema = z
  .object({
    job_id: z.string().trim().min(1).max(500),
    include_employer_context: z.boolean().default(true),
    candidate_context: candidateContextSchema.optional(),
  })
  .passthrough();

export type SearchJobsInput = z.infer<typeof searchJobsSchema>;
export type GetJobDetailInput = z.infer<typeof getJobDetailSchema>;

const OJCP_TOOLS: Tool[] = [
  {
    name: "search_jobs",
    description: "Search FreeHire live for open job opportunities.",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search query, e.g. 'senior backend engineer remote'",
        },
        location: {
          type: "object",
          properties: {
            city: { type: "string" },
            country: { type: "string" },
            remote_ok: { type: "boolean" },
          },
          additionalProperties: true,
        },
        candidate_context: candidateContextInputSchema,
        pagination: {
          type: "object",
          properties: {
            limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
            offset: { type: "integer", default: 0, minimum: 0 },
          },
          additionalProperties: true,
        },
      },
      required: ["query"],
      additionalProperties: true,
    },
  },
  {
    name: "get_job_detail",
    description: "Retrieve full details for a specific JobOps job posting.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "The unique OJCP job identifier",
        },
        include_employer_context: { type: "boolean", default: true },
        candidate_context: candidateContextInputSchema,
      },
      required: ["job_id"],
      additionalProperties: true,
    },
  },
];

function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const leadingDate = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (leadingDate) return leadingDate;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? undefined
    : new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeEnum(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!normalized) return undefined;
  if (normalized === "fulltime") return "full_time";
  if (normalized === "parttime") return "part_time";
  return normalized;
}

function parseSkills(value: string | null | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const skills = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      if (skills.length > 0) return skills;
    }
  } catch {
    // Extractors also store plain comma-separated skill lists.
  }
  const skills = value
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return skills.length > 0 ? skills : undefined;
}

function isRemoteJob(job: OjcpJob): boolean {
  return (
    job.isRemote === true ||
    /\bremote\b/i.test(`${job.location ?? ""} ${job.workFromHomeType ?? ""}`)
  );
}

function mapSalary(job: OjcpJob): Record<string, unknown> | undefined {
  if (job.salaryMinAmount == null && job.salaryMaxAmount == null)
    return undefined;
  return {
    "@type": "MonetaryAmountDistribution",
    ...(job.salaryCurrency ? { currency: job.salaryCurrency } : {}),
    ...(job.salaryMinAmount != null ? { minValue: job.salaryMinAmount } : {}),
    ...(job.salaryMaxAmount != null ? { maxValue: job.salaryMaxAmount } : {}),
    ...(job.salaryInterval
      ? { unitText: job.salaryInterval.toUpperCase() }
      : {}),
  };
}

function mapApplyPath(job: OjcpJob): Record<string, unknown> {
  return {
    type: "external_redirect",
    url: job.applicationLink ?? job.jobUrl,
    supports_agent_submission: false,
  };
}

export function mapJobPosting(
  job: OjcpJob,
  options: { includeDescription: boolean },
): Record<string, unknown> {
  const description = stripHtmlTags(job.jobDescription ?? "");
  const skills = parseSkills(job.skills);
  const datePosted =
    toIsoDate(job.datePosted) ?? toIsoDate(job.discoveredAt) ?? "1970-01-01";
  return {
    ojcp_id: job.id,
    title: job.title,
    employer: {
      "@type": "Organization",
      name: job.employer,
      ...((job.companyUrlDirect ?? job.employerUrl)
        ? { url: job.companyUrlDirect ?? job.employerUrl }
        : {}),
      ...(job.companyLogo ? { logo: job.companyLogo } : {}),
    },
    ...(job.visaSponsorMatch
      ? { visa_sponsor_match: job.visaSponsorMatch }
      : {}),
    datePosted,
    ...(toIsoDate(job.deadline)
      ? { validThrough: toIsoDate(job.deadline) }
      : {}),
    ...(options.includeDescription && description
      ? { description }
      : description
        ? { description: description.slice(0, 500) }
        : {}),
    ...(normalizeEnum(job.jobType)
      ? { employmentType: normalizeEnum(job.jobType) }
      : {}),
    ...(normalizeEnum(job.jobLevel)
      ? { experienceLevel: normalizeEnum(job.jobLevel) }
      : {}),
    ...(job.location ? { jobLocation: job.location } : {}),
    ...(isRemoteJob(job) ? { remote_policy: "remote" } : {}),
    ...(mapSalary(job) ? { baseSalary: mapSalary(job) } : {}),
    ...(job.salary ? { salary_text: job.salary } : {}),
    ...(skills ? { skills_required: skills } : {}),
    ...(job.jobFunction ? { department: job.jobFunction } : {}),
    ...(job.sourceJobId ? { requisition_id: job.sourceJobId } : {}),
    url: job.jobUrl,
    apply_paths: [mapApplyPath(job)],
  };
}

type OjcpWarning = { code: string; message: string };

function pruneCache<T extends { expiresAt: number }>(
  cache: Map<string, T>,
  maxEntries: number,
): void {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function toOjcpJob(input: CreateJobInput, discoveredAt: string): OjcpJob {
  const sourceId =
    input.sourceJobId?.trim() ||
    createHash("sha256").update(input.jobUrl).digest("hex").slice(0, 24);
  return {
    ...input,
    id: `${OJCP_ID_PREFIX}${encodeURIComponent(sourceId)}`,
    discoveredAt,
  };
}

function cacheDetails(jobs: OjcpJob[]): void {
  const expiresAt = Date.now() + DETAIL_CACHE_TTL_MS;
  for (const job of jobs) {
    detailCache.delete(job.id);
    detailCache.set(job.id, { expiresAt, job });
  }
  pruneCache(detailCache, DETAIL_CACHE_MAX_ENTRIES);
}

function unsupportedFilters(input: SearchJobsInput): string[] {
  return [
    ...(input.location?.state ? ["location.state"] : []),
    ...(input.location?.radius_miles !== undefined
      ? ["location.radius_miles"]
      : []),
    ...(input.filters?.employment_type ? ["filters.employment_type"] : []),
    ...(input.filters?.salary_min !== undefined ? ["filters.salary_min"] : []),
    ...(input.filters?.salary_max !== undefined ? ["filters.salary_max"] : []),
    ...(input.filters?.experience_level ? ["filters.experience_level"] : []),
    ...(input.filters?.posted_within_days !== undefined
      ? ["filters.posted_within_days"]
      : []),
  ];
}

function searchCacheKey(input: SearchJobsInput): string {
  return JSON.stringify({
    query: input.query,
    location: input.location,
    pagination: input.pagination,
    hasCandidateContext: Boolean(input.candidate_context),
  });
}

async function enrichSponsorMatches(
  jobs: OjcpJob[],
  country: string | undefined,
): Promise<{ jobs: OjcpJob[]; warning?: OjcpWarning }> {
  if (!country) {
    return {
      jobs,
      warning: {
        code: "visa_sponsor_not_checked",
        message: "A country is required for visa sponsor matching.",
      },
    };
  }

  try {
    const countryKey = normalizeCountryKey(country);
    const checks = await Promise.all(
      jobs.map((job) =>
        visaSponsors.searchSponsorsExact(job.employer, { countryKey }),
      ),
    );
    if (checks.length > 0 && !checks.some((check) => check.available)) {
      return {
        jobs,
        warning: {
          code: "visa_sponsor_data_unavailable",
          message: `Visa sponsor data is unavailable for ${country}.`,
        },
      };
    }

    return {
      jobs: jobs.map((job, index) => {
        const check = checks[index];
        if (!check?.available || !check.providerIds[0]) return job;
        const matchedOrganisations = [
          ...new Set(
            check.results.map((result) => result.sponsor.organisationName),
          ),
        ];
        return {
          ...job,
          visaSponsorMatch: {
            exact_name_match: matchedOrganisations.length > 0,
            provider_id: check.providerIds[0],
            ...(matchedOrganisations.length > 0
              ? { matched_organisations: matchedOrganisations }
              : {}),
          },
        };
      }),
    };
  } catch (error) {
    logger.warn("OJCP visa sponsor enrichment failed", {
      route: "POST /ojcp/mcp",
      error: sanitizeUnknown(error),
    });
    return {
      jobs,
      warning: {
        code: "visa_sponsor_check_failed",
        message: "Visa sponsor matching was temporarily unavailable.",
      },
    };
  }
}

async function searchJobsLive(
  input: SearchJobsInput,
): Promise<Record<string, unknown>> {
  const page = await fetchFreeHirePage({
    searchTerm: input.query,
    selectedCountry: input.location?.country,
    locations: input.location?.city ? [input.location.city] : undefined,
    workplaceTypes:
      input.location?.remote_ok === false ? ["hybrid", "onsite"] : undefined,
    limit: input.pagination.limit,
    offset: input.pagination.offset,
    timeoutMs: FREEHIRE_TIMEOUT_MS,
  });
  const discoveredAt = new Date().toISOString();
  const sponsorEnrichment = await enrichSponsorMatches(
    page.jobs.map((job) => toOjcpJob(job, discoveredAt)),
    input.location?.country,
  );
  cacheDetails(sponsorEnrichment.jobs);

  const warnings = [
    ...(sponsorEnrichment.warning ? [sponsorEnrichment.warning] : []),
    ...(input.candidate_context
      ? [
          {
            code: "candidate_context_not_applied",
            message:
              "Candidate context was validated but not used for personalization.",
          },
        ]
      : []),
  ];

  return {
    ojcp_version: OJCP_VERSION,
    query: input.query,
    total_results: page.total,
    returned: sponsorEnrichment.jobs.length,
    offset: page.offset,
    jobs: sponsorEnrichment.jobs.map((job) =>
      mapJobPosting(job, { includeDescription: false }),
    ),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function searchJobs(
  input: SearchJobsInput,
): Promise<Record<string, unknown>> {
  const unsupported = unsupportedFilters(input);
  if (unsupported.length > 0) {
    throw ojcpError(
      "unsupported_filter",
      `FreeHire does not support: ${unsupported.join(", ")}.`,
      { unsupported_filters: unsupported },
    );
  }

  pruneCache(searchCache, SEARCH_CACHE_MAX_ENTRIES);
  const key = searchCacheKey(input);
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const existing = inFlightSearches.get(key);
  if (existing) return existing;
  if (inFlightSearches.size >= SEARCH_CONCURRENCY) {
    throw ojcpError(
      "provider_busy",
      "Too many live searches are running. Try again shortly.",
      { retry_after_seconds: 1 },
    );
  }

  const search = searchJobsLive(input);
  inFlightSearches.set(key, search);
  try {
    const result = await search;
    searchCache.set(key, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      result,
    });
    pruneCache(searchCache, SEARCH_CACHE_MAX_ENTRIES);
    return result;
  } finally {
    inFlightSearches.delete(key);
  }
}

export async function getJobDetail(input: GetJobDetailInput) {
  pruneCache(detailCache, DETAIL_CACHE_MAX_ENTRIES);
  const job = detailCache.get(input.job_id)?.job;
  if (!job) {
    throw ojcpError("job_not_found", `No job found with ID ${input.job_id}.`, {
      job_id: input.job_id,
    });
  }
  return {
    ojcp_version: OJCP_VERSION,
    job: mapJobPosting(job, { includeDescription: true }),
    ...(input.include_employer_context
      ? {
          employer_context: {
            name: job.employer,
            ...(job.companyDescription
              ? { description: job.companyDescription }
              : {}),
            ...(job.companyIndustry
              ? { industries: [job.companyIndustry] }
              : {}),
            ...((job.companyUrlDirect ?? job.employerUrl)
              ? { url: job.companyUrlDirect ?? job.employerUrl }
              : {}),
            ...(job.companyNumEmployees
              ? { employee_count: job.companyNumEmployees }
              : {}),
          },
        }
      : {}),
    ...(input.candidate_context
      ? {
          warnings: [
            {
              code: "candidate_context_not_applied",
              message:
                "Candidate context was validated but not used for personalization.",
            },
          ],
        }
      : {}),
  };
}

export function __resetOjcpCachesForTests(): void {
  detailCache.clear();
  searchCache.clear();
  inFlightSearches.clear();
}

function ojcpError(
  errorCode: string,
  message: string,
  details?: unknown,
): McpError {
  const envelope = {
    ojcp_version: OJCP_VERSION,
    error_code: errorCode,
    message,
    ...(details === undefined ? {} : { details: sanitizeUnknown(details) }),
  };
  return new McpError(OJCP_ERROR_CODE, message, envelope);
}

function parseInput<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw ojcpError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid tool input.",
      parsed.error.flatten(),
    );
  }
  return parsed.data as z.infer<Schema>;
}

function toolResult(data: Record<string, unknown>): CallToolResult {
  return {
    structuredContent: data,
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

function createOjcpServer(): Server {
  const server = new Server(
    { name: "jobops-ojcp", version: OJCP_VERSION },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: OJCP_TOOLS,
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name === "search_jobs") {
        return toolResult(
          await searchJobs(
            parseInput(searchJobsSchema, request.params.arguments),
          ),
        );
      }
      if (request.params.name === "get_job_detail") {
        return toolResult(
          await getJobDetail(
            parseInput(getJobDetailSchema, request.params.arguments),
          ),
        );
      }
      throw ojcpError(
        "invalid_request",
        `Unknown OJCP tool: ${request.params.name}`,
      );
    } catch (error) {
      if (error instanceof McpError) throw error;
      logger.error("OJCP tool failed", {
        route: "POST /ojcp/mcp",
        tool: request.params.name,
        error: sanitizeUnknown(error),
      });
      throw ojcpError(
        "provider_error",
        "JobOps could not complete the request.",
      );
    }
  });
  return server;
}

function sendJsonRpcError(
  res: Response,
  status: number,
  message: string,
): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: OJCP_ERROR_CODE, message },
    id: null,
  });
}

export const ojcpMcpHandler: RequestHandler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJsonRpcError(res, 405, "Method not allowed.");
    return;
  }

  const server = createOjcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("OJCP MCP request failed", {
      route: "POST /ojcp/mcp",
      error: sanitizeUnknown(error),
    });
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, "Internal server error.");
    }
  } finally {
    await server.close();
  }
};

export function createOjcpManifest(req: Request) {
  const origin = resolveRequestOrigin(req);
  return {
    ojcp_version: OJCP_VERSION,
    provider: {
      name: "JobOps",
      description: "Live job search backed by FreeHire.",
    },
    mcp_endpoint: origin ? `${origin}/ojcp/mcp` : "/ojcp/mcp",
    tools: OJCP_TOOLS.map((tool) => tool.name),
    auth: { required: false },
  };
}

export const ojcpManifestHandler: RequestHandler = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(createOjcpManifest(req));
};
