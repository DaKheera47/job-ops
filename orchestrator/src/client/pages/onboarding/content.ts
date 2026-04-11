import type { StepId, ValidationState } from "./types";

export const EMPTY_VALIDATION_STATE: ValidationState = {
  valid: false,
  message: null,
  checked: false,
};

export const STEP_COPY: Record<
  StepId,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  llm: {
    eyebrow: "Step 1",
    title: "Choose the LLM connection Job Ops should trust.",
    description:
      "Pick the provider, confirm the endpoint, and validate the credentials this workspace will use for scoring and tailoring.",
  },
  baseresume: {
    eyebrow: "Step 2",
    title:
      "Reactive Resume is optional. Upload a resume, or connect Reactive Resume to begin.",
    description:
      "Upload a PDF or DOCX resume to create a local Design Resume right away. If you already keep a resume in Reactive Resume, continue to the next step and connect it there instead.",
  },
  rxresume: {
    eyebrow: "Step 3",
    title: "Optional: connect Reactive Resume for export and template sync.",
    description:
      "Reactive Resume remains optional. Connect it only if you want upstream PDF export or want Job Ops to start from a template resume in your Reactive Resume account.",
  },
  basicauth: {
    eyebrow: "Step 4",
    title: "Decide whether write actions should be protected.",
    description:
      "You can enable basic auth now for a safer local setup, or explicitly skip it for now and come back later in Settings.",
  },
};
