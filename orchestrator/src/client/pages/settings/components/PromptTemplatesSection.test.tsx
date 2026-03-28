import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { PromptTemplatesSection } from "./PromptTemplatesSection";

const PromptTemplatesHarness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      ghostwriterSystemPromptTemplate: "Custom Ghostwriter",
      tailoringPromptTemplate: "Custom Tailoring",
      scoringPromptTemplate: "Custom Scoring",
    },
  });

  return (
    <FormProvider {...methods}>
      <Accordion type="multiple" defaultValue={["prompt-templates"]}>
        <PromptTemplatesSection
          values={{
            ghostwriterSystemPromptTemplate: {
              effective: "Custom Ghostwriter",
              default: getDefaultPromptTemplate(
                "ghostwriterSystemPromptTemplate",
              ),
            },
            tailoringPromptTemplate: {
              effective: "Custom Tailoring",
              default: getDefaultPromptTemplate("tailoringPromptTemplate"),
            },
            scoringPromptTemplate: {
              effective: "Custom Scoring",
              default: getDefaultPromptTemplate("scoringPromptTemplate"),
            },
          }}
          isLoading={false}
          isSaving={false}
        />
      </Accordion>
    </FormProvider>
  );
};

describe("PromptTemplatesSection", () => {
  it("renders the warning and placeholder reference", () => {
    render(<PromptTemplatesHarness />);

    expect(
      screen.getByText(/changing these templates can degrade/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("{{tone}}").length).toBeGreaterThan(0);
    expect(screen.getAllByText("{{profileJson}}").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("{{scoringInstructionsText}}").length,
    ).toBeGreaterThan(0);
  });

  it("resets one prompt back to its default template", () => {
    render(<PromptTemplatesHarness />);

    fireEvent.click(screen.getAllByRole("button", { name: /^reset$/i })[0]);

    expect(screen.getByLabelText(/ghostwriter system prompt/i)).toHaveValue(
      getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
    );
  });

  it("resets all prompts back to their defaults", () => {
    render(<PromptTemplatesHarness />);

    fireEvent.click(screen.getByRole("button", { name: /reset all prompts/i }));

    expect(screen.getByLabelText(/ghostwriter system prompt/i)).toHaveValue(
      getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
    );
    expect(screen.getByLabelText(/resume tailoring prompt/i)).toHaveValue(
      getDefaultPromptTemplate("tailoringPromptTemplate"),
    );
    expect(screen.getByLabelText(/job scoring prompt/i)).toHaveValue(
      getDefaultPromptTemplate("scoringPromptTemplate"),
    );
  });
});
