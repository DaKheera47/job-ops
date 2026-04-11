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
  llm: {
    eyebrow: "Step 1",
    title: "Choose the LLM connection Job Ops should use.",
    description:
      "Pick the provider, confirm the endpoint, and validate the credentials this workspace will use for scoring and tailoring.",
  },
  baseresume: {
    eyebrow: "Step 2",
    title: "Import your current resume.",
    description:
      "Choose how to bring your base resume into Job Ops. Upload a PDF or DOCX to create a local Design Resume, or connect Reactive Resume with a v5 API key and select an existing resume there.",
  },
  basicauth: {
    eyebrow: "Step 3",
    title: "Secure your workspace",
    description:
      "Add a username and password so only signed-in users can access protected parts of Job Ops. You can always set this up later in Settings.",
  },
};
