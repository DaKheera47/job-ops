/**
 * Smart Apply pre-fill engine.
 *
 * Maps the candidate's design-resume `basics` block onto an arbitrary form
 * schema using label-based heuristics.  For fields we cannot confidently map
 * (essay-style screening questions, unknown selects), we emit a "skip" value
 * with a human-readable reason — the user will see those flagged in the
 * preview panel and fill them in by hand in the browser.
 *
 * This module is intentionally LLM-free for the demo: we don't want to ship
 * auto-generated cover-letter answers that the user submits without reading.
 * The user reviews every screening question in the rendered browser before
 * clicking Submit.
 */

import { existsSync } from "node:fs";
import { logger } from "@infra/logger";
import { getCandidateBasics, getCandidateNameParts } from "../candidate-profile";
import { safeFilePart } from "../pdf-storage";
import type { Job } from "@shared/types";
import {
  type FieldValue,
  type FormField,
  type FormSchema,
  type PrefilledField,
  type PrefilledForm,
} from "./types";

/** Match any of the supplied keywords against the field's normalised label. */
function labelMatches(field: FormField, keywords: string[]): boolean {
  const label = field.normalizedLabel;
  if (!label) return false;
  return keywords.some((kw) => label.includes(kw));
}

function pickFirstNonEmpty<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && (typeof v !== "string" || v.length > 0)) {
      return v;
    }
  }
  return null;
}

function makeSkip(reason: string): FieldValue {
  return { kind: "skip", reason };
}

interface PrefillContext {
  job: Pick<Job, "id" | "employer" | "title" | "pdfPath" | "coverLetterPdfPath">;
  basics: Awaited<ReturnType<typeof getCandidateBasics>>;
  nameParts: Awaited<ReturnType<typeof getCandidateNameParts>>;
}

function attachResume(
  field: FormField,
  ctx: PrefillContext,
): PrefilledField | null {
  if (field.type !== "file") return null;
  const isResumeField = labelMatches(field, [
    "resume",
    "cv",
    "résumé",
    "curriculum",
    "lebenslauf",
  ]);
  const isCoverField = labelMatches(field, [
    "cover letter",
    "motivation",
    "cover_letter",
    "covering letter",
  ]);

  let path: string | null = null;
  let visibleSuffix = "CV";
  if (isResumeField) {
    path = ctx.job.pdfPath ?? null;
    visibleSuffix = "CV";
  } else if (isCoverField) {
    path = ctx.job.coverLetterPdfPath ?? null;
    visibleSuffix = "CoverLetter";
  }

  if (!path || !existsSync(path)) {
    return {
      selector: field.selector,
      label: field.label,
      normalizedLabel: field.normalizedLabel,
      type: field.type,
      required: field.required,
      value: makeSkip(
        isCoverField
          ? "Cover letter PDF not generated yet — generate it from the job card first."
          : "Resume PDF not available — move the job to Ready in the bot to render it.",
      ),
      filled: false,
      requiresReview: field.required,
    };
  }

  const safeName = ctx.basics.name ? safeFilePart(ctx.basics.name) : "";
  const safeEmployer = safeFilePart(ctx.job.employer);
  const visibleName =
    safeName && safeEmployer
      ? `${safeName}_${safeEmployer}_${visibleSuffix}.pdf`
      : safeName
        ? `${safeName}_${visibleSuffix}.pdf`
        : `${visibleSuffix}.pdf`;

  return {
    selector: field.selector,
    label: field.label,
    normalizedLabel: field.normalizedLabel,
    type: field.type,
    required: field.required,
    value: { kind: "file", path, visibleName },
    filled: true,
    requiresReview: false,
  };
}

function attachBasic(field: FormField, ctx: PrefillContext): PrefilledField | null {
  // Order matters: more-specific labels go first.
  if (labelMatches(field, ["first name", "given name", "vorname"])) {
    const value = ctx.nameParts.firstName;
    return makeText(field, value, "First name from your resume.");
  }
  if (labelMatches(field, ["last name", "family name", "surname", "nachname"])) {
    const value = ctx.nameParts.lastName;
    return makeText(field, value, "Last name from your resume.");
  }
  if (labelMatches(field, ["full name", "your name", "name"]) && field.type !== "file") {
    return makeText(
      field,
      pickFirstNonEmpty(ctx.basics.name, ctx.nameParts.fullName),
      "Full name from your resume.",
    );
  }
  if (labelMatches(field, ["email", "e-mail"]) || field.type === "email") {
    return makeText(field, ctx.basics.email, "Email from your resume.");
  }
  if (labelMatches(field, ["phone", "mobile", "telefon", "telephone"]) || field.type === "tel") {
    return makeText(field, ctx.basics.phone, "Phone from your resume.");
  }
  if (labelMatches(field, ["linkedin", "linkedin profile", "linkedin url"])) {
    return makeText(field, null, "We don't store LinkedIn on the resume — fill in if needed.");
  }
  if (labelMatches(field, ["website", "portfolio", "personal site"])) {
    return makeText(field, null, "Personal website — fill in if applicable.");
  }
  if (
    labelMatches(field, [
      "city",
      "location",
      "where are you based",
      "your location",
      "current location",
    ])
  ) {
    return makeText(field, ctx.basics.location, "Location from your resume.");
  }
  return null;
}

function makeText(
  field: FormField,
  value: string | null,
  note: string,
): PrefilledField {
  if (!value) {
    return {
      selector: field.selector,
      label: field.label,
      normalizedLabel: field.normalizedLabel,
      type: field.type,
      required: field.required,
      value: makeSkip(`We don't have a value for "${field.label}" yet.`),
      filled: false,
      requiresReview: field.required,
    };
  }
  return {
    selector: field.selector,
    label: field.label,
    normalizedLabel: field.normalizedLabel,
    type: field.type,
    required: field.required,
    value: { kind: "text", value },
    filled: true,
    requiresReview: false,
    note,
  };
}

function defaultUnfilled(field: FormField): PrefilledField {
  // The default "we don't know" path: tell the user to review.  For required
  // fields this is critical, for optionals it's a friendly nudge.
  return {
    selector: field.selector,
    label: field.label,
    normalizedLabel: field.normalizedLabel,
    type: field.type,
    required: field.required,
    value: makeSkip(
      field.type === "textarea"
        ? "Free-text answer — write your own (we don't auto-draft to avoid LLM mistakes you'd ship without noticing)."
        : field.type === "select" || field.type === "radio"
          ? "Choose the right option yourself."
          : "Not auto-fillable — review in the browser.",
    ),
    filled: false,
    requiresReview: field.required,
  };
}

export async function buildPrefilledForm(args: {
  schema: FormSchema;
  job: Pick<Job, "id" | "employer" | "title" | "pdfPath" | "coverLetterPdfPath">;
}): Promise<PrefilledForm> {
  const basics = await getCandidateBasics();
  const nameParts = await getCandidateNameParts();
  const ctx: PrefillContext = { job: args.job, basics, nameParts };

  const fields: PrefilledField[] = args.schema.fields.map((field) => {
    return (
      attachResume(field, ctx) ||
      attachBasic(field, ctx) ||
      defaultUnfilled(field)
    );
  });

  const reviewRequiredCount = fields.filter((f) => f.requiresReview).length;
  logger.info("Smart Apply prefill ready", {
    ats: args.schema.ats,
    fields: fields.length,
    autoFilled: fields.filter((f) => f.filled).length,
    requiresReview: reviewRequiredCount,
  });

  return {
    ats: args.schema.ats,
    applyUrl: args.schema.applyUrl,
    fields,
    reviewRequiredCount,
  };
}
