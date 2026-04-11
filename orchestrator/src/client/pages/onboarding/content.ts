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
  rxresume: {
    eyebrow: "Step 2",
    title: "Connect the resume engine that will export tailored PDFs.",
    description:
      "Point Job Ops at your Reactive Resume instance so tailoring can render a final document without extra setup later.",
  },
  baseresume: {
    eyebrow: "Step 3",
    title: "Pick the template resume the pipeline will start from.",
    description:
      "This becomes the source document for tailoring, so choose the version you want every application to inherit from.",
  },
  basicauth: {
    eyebrow: "Step 4",
    title: "Decide whether write actions should be protected.",
    description:
      "You can enable basic auth now for a safer local setup, or explicitly skip it for now and come back later in Settings.",
  },
};
