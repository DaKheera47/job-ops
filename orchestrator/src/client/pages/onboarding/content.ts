import type { StepId, ValidationState } from "./types";

export const EMPTY_VALIDATION_STATE: ValidationState = {
  valid: false,
  message: null,
  checked: false,
  hydrated: false,
};

export const STEP_COPY: Record<
  StepId,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  model: {
    eyebrow: "System check 1",
    title: "Connect the model that will read and rank jobs.",
    description:
      "Pick the provider, confirm the endpoint, and verify the credentials once. Job Ops uses this connection for scoring, tailoring, and first-run setup.",
  },
  resume: {
    eyebrow: "System check 2",
    title: "Load the resume Job Ops should optimize from.",
    description:
      "Upload a PDF, DOCX, or Reactive Resume JSON, or connect Reactive Resume and select a template. Search terms are derived automatically before the first pipeline run.",
  },
};
