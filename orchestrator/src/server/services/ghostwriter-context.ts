import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { Job, ResumeProfile } from "@shared/types";
import { badRequest, notFound } from "../infra/errors";
import * as jobsRepo from "../repositories/jobs";
import * as settingsRepo from "../repositories/settings";
import { getProfile } from "./profile";
import { resolveSettingValue } from "./settings-conversion";

type JobChatStyle = {
  tone: string;
  formality: string;
  constraints: string;
  doNotUse: string;
};

export type JobChatPromptContext = {
  job: Job;
  style: JobChatStyle;
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
};

const MAX_JOB_DESCRIPTION = 4000;
const MAX_PROFILE_SUMMARY = 1200;
const MAX_SKILLS = 18;
const MAX_PROJECTS = 6;
const MAX_EXPERIENCE = 5;
const MAX_ITEM_TEXT = 320;

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

function buildSystemPrompt(style: JobChatStyle): string {
  return compactJoin([
    "You are Ghostwriter, a job-application writing assistant for a single job.",
    "Use only the provided job and profile context unless the user gives extra details.",
    "Do not claim actions were executed. You are read-only and advisory.",
    "If details are missing, say what is missing before making assumptions.",
    "Avoid exposing private profile details that are unrelated to the user request.",
    `Writing style tone: ${style.tone}.`,
    `Writing style formality: ${style.formality}.`,
    style.constraints ? `Writing constraints: ${style.constraints}` : null,
    style.doNotUse ? `Avoid these terms: ${style.doNotUse}` : null,
  ]);
}

async function resolveStyle(): Promise<JobChatStyle> {
  const overrides = await settingsRepo.getAllSettings();
  const tone = resolveSettingValue(
    "chatStyleTone",
    overrides.chatStyleTone,
  ).value;
  const formality = resolveSettingValue(
    "chatStyleFormality",
    overrides.chatStyleFormality,
  ).value;
  const constraints = resolveSettingValue(
    "chatStyleConstraints",
    overrides.chatStyleConstraints,
  ).value;
  const doNotUse = resolveSettingValue(
    "chatStyleDoNotUse",
    overrides.chatStyleDoNotUse,
  ).value;

  return {
    tone,
    formality,
    constraints,
    doNotUse,
  };
}

export async function buildJobChatPromptContext(
  jobId: string,
): Promise<JobChatPromptContext> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) {
    throw notFound("Job not found");
  }

  const style = await resolveStyle();

  let profile: ResumeProfile = {};
  try {
    profile = await getProfile();
  } catch (error) {
    logger.warn("Failed to load profile for job chat context", {
      jobId,
      error: sanitizeUnknown(error),
    });
  }

  const systemPrompt = buildSystemPrompt(style);
  const jobSnapshot = buildJobSnapshot(job);
  const profileSnapshot = buildProfileSnapshot(profile);

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
    }),
  });

  return {
    job,
    style,
    systemPrompt,
    jobSnapshot,
    profileSnapshot,
  };
}
