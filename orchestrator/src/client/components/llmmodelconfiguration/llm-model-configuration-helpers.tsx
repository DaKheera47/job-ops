import type { LlmPurpose } from "@shared/types";

function buildModelOptions(input: {
  models: string[];
  emptyLabel: string;
  emptyValue: string;
  fallbackValue?: string;
}) {
  const options = [
    {
      value: input.emptyValue,
      label: input.emptyLabel,
      searchText: input.emptyLabel,
    },
    ...input.models.map((model) => ({
      value: model,
      label: model,
      searchText: model,
    })),
  ];

  const fallbackValue = input.fallbackValue?.trim();
  if (
    fallbackValue &&
    !options.some((option) => option.value === fallbackValue)
  ) {
    options.unshift({
      value: fallbackValue,
      label: fallbackValue,
      searchText: `${fallbackValue} custom`,
    });
  }

  return options;
}

function renderKeyHelper(
  helperText: string,
  helperHref: string | null,
  keepSavedKey: boolean,
) {
  return (
    <>
      {helperHref ? (
        <a
          href={helperHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
        >
          {helperText}
        </a>
      ) : (
        helperText
      )}
      {keepSavedKey ? ". Leave blank to keep the saved key." : null}
    </>
  );
}

const LLM_PURPOSES: Array<{
  id: LlmPurpose;
  label: string;
  description: string;
}> = [
  {
    id: "scoring",
    label: "Scoring",
    description: "Job fit, brief extraction, and ranking decisions.",
  },
  {
    id: "tailoring",
    label: "Tailoring",
    description: "Ghostwriter, Resume content tailoring.",
  },
  {
    id: "projectSelection",
    label: "Project selection",
    description: "Choosing resume projects for a job.",
  },
];

export { buildModelOptions, renderKeyHelper, LLM_PURPOSES };
