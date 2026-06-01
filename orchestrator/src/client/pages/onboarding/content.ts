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
    title: "Connect the model that powers Job Ops.",
    description:
      "Pick the provider, confirm the endpoint, and verify the credentials once. This unlocks scoring, tailoring, ghostwriting, and email classification.",
  },
  resume: {
    eyebrow: "System check 2",
    title: "Load the resume Job Ops should work from.",
    description:
      "Upload a PDF, DOCX, or Reactive Resume JSON, or connect Reactive Resume and select a template. This unlocks job matching, fit assessment, and better application workflows.",
  },
};
