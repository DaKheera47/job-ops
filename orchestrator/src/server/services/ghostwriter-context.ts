import { badRequest, notFound } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import {
  buildGhostwriterNoteContextItems,
  normalizeGhostwriterSelectedNoteIds,
} from "@shared/ghostwriter-note-context.js";
import { settingsRegistry } from "@shared/settings-registry";
import type { Job, ResumeProfile } from "@shared/types";
import * as jobsRepo from "../repositories/jobs";
import * as settingsRepo from "../repositories/settings";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import { getProfile } from "./profile";
import {
  getEffectivePromptTemplate,
  renderPromptTemplate,
} from "./prompt-templates";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
  type WritingStyle,
} from "./writing-style";

export type JobChatPromptContext = {
  job: Job;
  style: WritingStyle;
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
  selectedNotesSnapshot: string;
};

const MAX_JOB_DESCRIPTION = 4000;
const MAX_PROFILE_SUMMARY = 1200;
const MAX_SKILLS = 18;
const MAX_PROJECTS = 6;
const MAX_EXPERIENCE = 5;
const MAX_ITEM_TEXT = 320;

const STOP_SLOP_GHOSTWRITER_PROMPT = `
Stop Slop revision rules for Ghostwriter prose:
- Cut filler openers and emphasis crutches. Start with the useful sentence.
- Avoid business jargon such as navigate, unpack, landscape, game-changer, deep dive, moving forward, and circle back.
- Remove adverbs, softeners, and intensifiers such as really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, importantly, and crucially.
- Avoid formulaic structures: "not X but Y", "X is not the problem, Y is", negative buildup, rhetorical setups, and punchy one-line endings.
- Use active voice. Name the person or team doing the action.
- Do not give inanimate things human agency. Data does not tell us; a person reads data.
- Be specific. Replace vague claims, lazy extremes, and abstract importance with concrete details from the job, profile, or user prompt.
- Put the reader in the room. Use "you" when it fits the requested output.
- Vary rhythm. Mix sentence lengths, prefer one or two items over three, and avoid stacked fragments.
- Do not use em dashes.
- Before answering, revise once for directness, rhythm, trust, authenticity, and density.
`.trim();

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n");
}

function buildJobSnapshot(job: Job): string {
  const snapshot = {
    event: "job.completed",
    sentAt: new Date().toISOString(),
    job: {
      id: job.id,
      source: job.source,
      title: job.title,
      employer: job.employer,
      location: job.location,
      salary: job.salary,
      status: job.status,
      jobUrl: job.jobUrl,
      applicationLink: job.applicationLink,
      suitabilityScore: job.suitabilityScore,
      suitabilityReason: truncate(job.suitabilityReason, 600),
      tailoredSummary: truncate(job.tailoredSummary, 1200),
      tailoredHeadline: truncate(job.tailoredHeadline, 300),
      tailoredSkills: truncate(job.tailoredSkills, 1200),
      jobDescription: truncate(job.jobDescription, MAX_JOB_DESCRIPTION),
    },
  };

  return JSON.stringify(snapshot, null, 2);
}

function buildProfileSnapshot(profile: ResumeProfile): string {
  const summary =
    truncate(profile?.sections?.summary?.content, MAX_PROFILE_SUMMARY) ||
    truncate(profile?.basics?.summary, MAX_PROFILE_SUMMARY);

  const skills = (profile?.sections?.skills?.items ?? [])
    .slice(0, MAX_SKILLS)
    .map((item) => {
      const keywords = (item.keywords ?? []).slice(0, 8).join(", ");
      return `${item.name}${keywords ? `: ${keywords}` : ""}`;
    });

  const projects = (profile?.sections?.projects?.items ?? [])
    .filter((item) => item.visible !== false)
    .slice(0, MAX_PROJECTS)
    .map(
      (item) =>
        `${item.name} (${item.date || "n/a"}): ${truncate(item.summary, MAX_ITEM_TEXT)}`,
    );

  const experience = (profile?.sections?.experience?.items ?? [])
    .filter((item) => item.visible !== false)
    .slice(0, MAX_EXPERIENCE)
    .map(
      (item) =>
        `${item.position} @ ${item.company} (${item.date || "n/a"}): ${truncate(item.summary, MAX_ITEM_TEXT)}`,
    );

  return compactJoin([
    `Name: ${profile?.basics?.name || "Unknown"}`,
    `Headline: ${truncate(profile?.basics?.headline || profile?.basics?.label, 200) || ""}`,
    summary ? `Summary:\n${summary}` : null,
    skills.length > 0 ? `Skills:\n- ${skills.join("\n- ")}` : null,
    projects.length > 0 ? `Projects:\n- ${projects.join("\n- ")}` : null,
    experience.length > 0 ? `Experience:\n- ${experience.join("\n- ")}` : null,
  ]);
}

async function buildSelectedNotesSnapshot(
  jobId: string,
  selectedNoteIds: readonly string[],
): Promise<string> {
  const normalizedNoteIds =
    normalizeGhostwriterSelectedNoteIds(selectedNoteIds);
  if (normalizedNoteIds.length === 0) return "";

  const notes = await jobsRepo.listJobNotesByIds(jobId, normalizedNoteIds);
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const selectedNotes = normalizedNoteIds
    .map((noteId) => notesById.get(noteId))
    .filter((note): note is (typeof notes)[number] => Boolean(note));

  if (selectedNotes.length === 0) return "";

  const context = buildGhostwriterNoteContextItems(selectedNotes);
  return compactJoin([
    "Selected Job Notes:",
    ...context.items.map((note, index) =>
      compactJoin([
        `Note ${index + 1}: ${note.title}`,
        `Updated: ${note.updatedAt}`,
        note.wasTrimmed ? "Context note: trimmed for AI context limits." : null,
        note.content ? `Content:\n${note.content}` : "Content: [empty]",
      ]),
    ),
  ]);
}

async function buildSystemPrompt(
  style: WritingStyle,
  profile: ResumeProfile,
): Promise<string> {
  const resolvedLanguage = resolveWritingOutputLanguage({
    style,
    profile,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  const effectiveConstraints = stripLanguageDirectivesFromConstraints(
    style.constraints,
  );
  const template = await getEffectivePromptTemplate(
    "ghostwriterSystemPromptTemplate",
  );

  return renderPromptTemplate(template, {
    outputLanguage,
    tone: style.tone,
    formality: style.formality,
    constraintsSentence: effectiveConstraints
      ? `Writing constraints: ${effectiveConstraints}`
      : "",
    avoidTermsSentence: style.doNotUse
      ? `Avoid these terms: ${style.doNotUse}`
      : "",
  });
}

async function isStopSlopEnabled(): Promise<boolean> {
  const raw = await settingsRepo.getSetting("ghostwriterStopSlopEnabled");
  return (
    settingsRegistry.ghostwriterStopSlopEnabled.parse(raw ?? undefined) ??
    settingsRegistry.ghostwriterStopSlopEnabled.default()
  );
}

export async function buildJobChatPromptContext(
  jobId: string,
  selectedNoteIds: readonly string[] = [],
): Promise<JobChatPromptContext> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) {
    throw notFound("Job not found");
  }

  const style = await getWritingStyle();

  let profile: ResumeProfile = {};
  try {
    profile = await getProfile();
  } catch (error) {
    logger.warn("Failed to load profile for job chat context", {
      jobId,
      error: sanitizeUnknown(error),
    });
  }

  const profileSnapshot = buildProfileSnapshot(profile);
  const [baseSystemPrompt, stopSlopEnabled, selectedNotesSnapshot] =
    await Promise.all([
      buildSystemPrompt(style, profile),
      isStopSlopEnabled(),
      buildSelectedNotesSnapshot(jobId, selectedNoteIds),
    ]);
  const systemPrompt = stopSlopEnabled
    ? `${baseSystemPrompt}\n\n${STOP_SLOP_GHOSTWRITER_PROMPT}`
    : baseSystemPrompt;
  const jobSnapshot = buildJobSnapshot(job);

  if (!jobSnapshot.trim()) {
    throw badRequest("Unable to build job context");
  }

  logger.info("Built job chat context", {
    jobId,
    includesProfile: Boolean(profileSnapshot),
    contextStats: sanitizeUnknown({
      systemChars: systemPrompt.length,
      jobChars: jobSnapshot.length,
      profileChars: profileSnapshot.length,
      selectedNotesChars: selectedNotesSnapshot.length,
      selectedNoteCount:
        normalizeGhostwriterSelectedNoteIds(selectedNoteIds).length,
    }),
  });

  return {
    job,
    style,
    systemPrompt,
    jobSnapshot,
    profileSnapshot,
    selectedNotesSnapshot,
  };
}
