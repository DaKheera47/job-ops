/**
 * Smart Apply — types shared between parser, prefill, session and API.
 *
 * The flow is:
 *   1. eligibility.ts decides whether a job can be auto-prefilled.
 *   2. parsers/* fetch and parse the apply form, returning a FormSchema.
 *   3. prefill.ts maps the candidate profile onto the schema, returning
 *      FieldValues (one entry per parsed field).
 *   4. session.ts uses Playwright to open the form in a headed Firefox
 *      session, fill it from FieldValues, attach the PDF, and stop short
 *      of clicking Submit.  The user reviews + submits in their browser
 *      over the existing noVNC viewer.
 *
 * Adding a new ATS = add a parser + (probably) extend the prefill logic
 * if it has structurally novel fields.  Everything else is shared.
 */

import type { Job } from "@shared/types";

export type SmartApplyAts = "greenhouse" | "ashby";

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "unknown";

export interface FormField {
  /** DOM selector or stable id usable by Playwright.  May be a CSS selector. */
  selector: string;
  /** Human-readable label shown above the field (e.g. "Last name *"). */
  label: string;
  /** Lower-cased normalised label slug used by the prefill mapper. */
  normalizedLabel: string;
  type: FormFieldType;
  required: boolean;
  /** For select/radio inputs: available option values + visible text. */
  options?: Array<{ value: string; label: string }>;
  /** For file inputs: accepted MIME types or extensions, if specified. */
  accept?: string;
  /** Free-text help/placeholder shown next to the field. */
  hint?: string;
}

export interface FormSchema {
  ats: SmartApplyAts;
  applyUrl: string;
  fields: FormField[];
  /** Whether a captcha was detected on the page — sessions don't start when true. */
  hasCaptcha: boolean;
}

/**
 * Value to put into one field.  String for text/email/tel, value strings for
 * select/radio, true|false for checkbox, file path for file uploads.
 */
export type FieldValue =
  | { kind: "text"; value: string }
  | { kind: "choice"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "file"; path: string; visibleName: string }
  | { kind: "skip"; reason: string };

export interface PrefilledField {
  selector: string;
  label: string;
  normalizedLabel: string;
  type: FormFieldType;
  required: boolean;
  value: FieldValue;
  /** True when we set a real value the user can rely on. */
  filled: boolean;
  /** True when the user definitely needs to verify before clicking Submit. */
  requiresReview: boolean;
  /** Optional context for the user (e.g. "drafted from job description"). */
  note?: string;
}

export interface PrefilledForm {
  ats: SmartApplyAts;
  applyUrl: string;
  fields: PrefilledField[];
  /** Convenience: list of `requiresReview=true` fields for UI summary. */
  reviewRequiredCount: number;
}

export type SmartApplyStatus =
  | "preparing"
  | "ready"
  | "submitted"
  | "expired"
  | "aborted"
  | "failed";

export interface SmartApplySessionDto {
  id: string;
  jobId: string;
  status: SmartApplyStatus;
  applyUrl: string;
  viewerUrl: string | null;
  viewerExpiresAt: number | null;
  submittedAt: number | null;
  errorMessage: string | null;
  prefilled: PrefilledForm | null;
  createdAt: string;
  updatedAt: string;
}

export type EligibilityVerdict =
  | { eligible: true; ats: SmartApplyAts; applyUrl: string }
  | { eligible: false; reason: string };

export interface JobApplicabilityContext {
  job: Pick<Job, "id" | "source" | "applicationLink" | "jobUrl">;
}
