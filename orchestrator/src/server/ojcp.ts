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
import * as jobsRepo from "@server/repositories/jobs";
import type { Job } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";

const OJCP_VERSION = "0.1";
const OJCP_ERROR_CODE = -32000;
const OJCP_ID_PREFIX = "jobops:";
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "for",
  "job",
  "jobs",
  "role",
  "roles",
  "the",
]);

const candidateContextSchema = z
  .object({
    consent_scope: z.array(z.string().trim().min(1)).min(1),
  })
  .passthrough();

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
    description: "Search the JobOps workspace for open job opportunities.",
    annotations: { readOnlyHint: true, openWorldHint: false },
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
            state: { type: "string" },
            country: { type: "string" },
            remote_ok: { type: "boolean" },
            radius_miles: { type: "number", exclusiveMinimum: 0 },
          },
          additionalProperties: true,
        },
        filters: {
          type: "object",
          properties: {
            employment_type: { type: "string" },
            salary_min: { type: "number" },
            salary_max: { type: "number" },
            experience_level: { type: "string" },
            posted_within_days: { type: "integer", minimum: 0 },
          },
          additionalProperties: true,
        },
        candidate_context: {
          $ref: "https://ojcp.dev/schemas/v0.1/candidate-context.json",
        },
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
        candidate_context: {
          $ref: "https://ojcp.dev/schemas/v0.1/candidate-context.json",
        },
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

function parseSkills(value: string | null): string[] | undefined {
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

function isRemoteJob(job: Job): boolean {
  return (
    job.isRemote === true ||
    /\bremote\b/i.test(`${job.location ?? ""} ${job.workFromHomeType ?? ""}`)
  );
}

function mapSalary(job: Job): Record<string, unknown> | undefined {
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

function mapApplyPath(job: Job): Record<string, unknown> {
  return {
    type: "external_redirect",
    url: job.applicationLink ?? job.jobUrl,
    supports_agent_submission: false,
  };
}

export function mapJobPosting(
  job: Job,
  options: { includeDescription: boolean },
): Record<string, unknown> {
  const description = stripHtmlTags(job.jobDescription ?? "");
  const skills = parseSkills(job.skills);
  const datePosted =
    toIsoDate(job.datePosted) ?? toIsoDate(job.discoveredAt) ?? "1970-01-01";
  return {
    ojcp_id: `${OJCP_ID_PREFIX}${job.id}`,
    title: job.title,
    employer: {
      "@type": "Organization",
      name: job.employer,
      ...((job.companyUrlDirect ?? job.employerUrl)
        ? { url: job.companyUrlDirect ?? job.employerUrl }
        : {}),
      ...(job.companyLogo ? { logo: job.companyLogo } : {}),
    },
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

function searchTerms(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}+#./-]+/gu) ?? []).filter(
    (term) => !SEARCH_STOP_WORDS.has(term),
  );
}

function searchRank(job: Job, terms: string[]): number | null {
  const title = job.title.toLowerCase();
  const employer = job.employer.toLowerCase();
  const location = job.location?.toLowerCase() ?? "";
  const skills = job.skills?.toLowerCase() ?? "";
  const description = stripHtmlTags(job.jobDescription ?? "").toLowerCase();
  const other = [
    job.jobType,
    job.jobLevel,
    job.jobFunction,
    job.disciplines,
    isRemoteJob(job) ? "remote" : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const all = `${title} ${employer} ${location} ${skills} ${description} ${other}`;
  if (!terms.every((term) => all.includes(term))) return null;
  return terms.reduce(
    (score, term) =>
      score +
      (title.includes(term) ? 8 : 0) +
      (employer.includes(term) ? 5 : 0) +
      (skills.includes(term) ? 4 : 0) +
      (location.includes(term) ? 3 : 0) +
      (other.includes(term) ? 2 : 0) +
      (description.includes(term) ? 1 : 0),
    0,
  );
}

function matchesFilters(
  job: Job,
  input: SearchJobsInput,
  now: number,
): boolean {
  if (job.status === "expired") return false;
  const filters = input.filters;
  if (
    filters?.employment_type &&
    normalizeEnum(job.jobType) !== normalizeEnum(filters.employment_type)
  ) {
    return false;
  }
  if (
    filters?.experience_level &&
    normalizeEnum(job.jobLevel) !== normalizeEnum(filters.experience_level)
  ) {
    return false;
  }
  if (filters?.salary_min !== undefined) {
    const jobMaximum = job.salaryMaxAmount ?? job.salaryMinAmount;
    if (jobMaximum == null || jobMaximum < filters.salary_min) return false;
  }
  if (filters?.salary_max !== undefined) {
    const jobMinimum = job.salaryMinAmount ?? job.salaryMaxAmount;
    if (jobMinimum == null || jobMinimum > filters.salary_max) return false;
  }
  if (filters?.posted_within_days !== undefined) {
    const posted = Date.parse(job.datePosted ?? job.discoveredAt);
    const cutoff = now - filters.posted_within_days * 86_400_000;
    if (Number.isNaN(posted) || posted < cutoff) return false;
  }

  const remote = isRemoteJob(job);
  if (input.location?.remote_ok === false && remote) return false;
  const requestedLocations = [
    input.location?.city,
    input.location?.state,
    input.location?.country,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  if (requestedLocations.length > 0) {
    const location = job.location?.toLowerCase() ?? "";
    const matchesLocation = requestedLocations.every((value) =>
      location.includes(value),
    );
    if (!matchesLocation && !(input.location?.remote_ok && remote))
      return false;
  }
  return true;
}

export function searchJobRecords(
  jobs: Job[],
  input: SearchJobsInput,
  now = Date.now(),
): Record<string, unknown> {
  const terms = searchTerms(input.query);
  // ponytail: an in-memory scan is enough for a personal workspace; add SQLite
  // FTS when measured search latency makes the extra index worth maintaining.
  const ranked = jobs
    .filter((job) => matchesFilters(job, input, now))
    .map((job) => ({ job, rank: searchRank(job, terms) }))
    .filter((item): item is { job: Job; rank: number } => item.rank !== null)
    .sort(
      (left, right) =>
        right.rank - left.rank ||
        Date.parse(right.job.datePosted ?? right.job.discoveredAt) -
          Date.parse(left.job.datePosted ?? left.job.discoveredAt),
    );
  const { limit, offset } = input.pagination;
  const warnings = [
    ...(input.location?.radius_miles !== undefined
      ? [
          {
            code: "radius_not_applied",
            message:
              "JobOps stores text locations, so radius_miles was treated as a location hint only.",
          },
        ]
      : []),
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
    total_results: ranked.length,
    returned: Math.min(limit, Math.max(0, ranked.length - offset)),
    offset,
    jobs: ranked
      .slice(offset, offset + limit)
      .map(({ job }) => mapJobPosting(job, { includeDescription: false })),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function searchJobs(input: SearchJobsInput) {
  return searchJobRecords(await jobsRepo.getAllJobs(), input);
}

export async function getJobDetail(input: GetJobDetailInput) {
  const internalId = input.job_id.startsWith(OJCP_ID_PREFIX)
    ? input.job_id.slice(OJCP_ID_PREFIX.length)
    : null;
  const job = internalId ? await jobsRepo.getJobById(internalId) : null;
  if (!job || job.status === "expired") {
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
      description:
        "Private, tenant-scoped job search and application workspace.",
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
