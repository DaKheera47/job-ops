/**
 * Service for AI-powered project selection for resumes.
 */

import { LlmNotConfiguredError } from "./llm-errors";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import type { ResumeProjectSelectionItem } from "./resumeProjects";

/** JSON schema for project selection response */
const PROJECT_SELECTION_SCHEMA: JsonSchemaDefinition = {
  name: "project_selection",
  schema: {
    type: "object",
    properties: {
      selectedProjectIds: {
        type: "array",
        items: { type: "string" },
        description: "List of project IDs to include on the resume",
      },
    },
    required: ["selectedProjectIds"],
    additionalProperties: false,
  },
};

export async function pickProjectIdsForJob(args: {
  jobDescription: string;
  eligibleProjects: ResumeProjectSelectionItem[];
  desiredCount: number;
}): Promise<string[]> {
  const desiredCount = Math.max(0, Math.floor(args.desiredCount));
  if (desiredCount === 0) return [];

  const eligibleIds = new Set(args.eligibleProjects.map((p) => p.id));
  if (eligibleIds.size === 0) return [];

  const model = await resolveLlmModel("projectSelection");

  const prompt = buildProjectSelectionPrompt({
    jobDescription: args.jobDescription,
    projects: args.eligibleProjects,
    desiredCount,
  });

  const llm = await createConfiguredLlmService();
  const result = await llm.callJson<{ selectedProjectIds: string[] }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: PROJECT_SELECTION_SCHEMA,
  });

  if (!result.success) {
    throw new LlmNotConfiguredError(
      `AI project selection failed: ${result.error}. Check your LLM configuration in Settings → Integrations, then resume scoring.`,
    );
  }

  const selectedProjectIds = Array.isArray(result.data?.selectedProjectIds)
    ? result.data.selectedProjectIds
    : [];

  // Validate and dedupe the returned IDs
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of selectedProjectIds) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (!eligibleIds.has(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
    if (unique.length >= desiredCount) break;
  }

  // An empty array from a successful response is a legitimate AI choice
  // ("none of these projects match this job"). Return it as-is — no fake
  // fallback. The caller decides whether to keep the resume with no
  // recommended projects or fall back to user-locked ones.
  return unique;
}

function buildProjectSelectionPrompt(args: {
  jobDescription: string;
  projects: ResumeProjectSelectionItem[];
  desiredCount: number;
}): string {
  const projects = args.projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    date: p.date,
    summary: truncate(p.summaryText, 500),
  }));

  return `
You are selecting which projects to include on a resume for a specific job.

Rules:
- Choose up to ${args.desiredCount} project IDs.
- Only choose IDs from the provided list.
- Prefer projects that strongly match the job description keywords/tech stack.
- Prefer projects that signal impact and real-world engineering.
- Do NOT invent projects or skills.

Job description:
${args.jobDescription}

Candidate projects (pick from these IDs only):
${JSON.stringify(projects, null, 2)}

Respond with JSON only, in this exact shape:
{
  "selectedProjectIds": ["id1", "id2"]
}
`.trim();
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1).trimEnd()}…`;
}
