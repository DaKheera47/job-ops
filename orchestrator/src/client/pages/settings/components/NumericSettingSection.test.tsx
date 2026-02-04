import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { NumericSettingSection } from "./NumericSettingSection";

const Harness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      ukvisajobsMaxJobs: 50,
    },
  });

  return (
    <FormProvider {...methods}>
      <Accordion type="multiple" defaultValue={["ukvisajobs"]}>
        <NumericSettingSection
          accordionValue="ukvisajobs"
          title="UKVisaJobs Extractor"
          fieldName="ukvisajobsMaxJobs"
          label="Max jobs to fetch"
          helper="Maximum jobs per run."
          values={{ default: 50, effective: 50 }}
          min={1}
          max={1000}
          isLoading={false}
          isSaving={false}
        />
      </Accordion>
    </FormProvider>
  );
};

describe("NumericSettingSection", () => {
  it("clamps out-of-range values and clears invalid number input", () => {
    render(<Harness />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1001" } });
    expect(input).toHaveValue(1000);

    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveValue(1);

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(50);
  });
});
