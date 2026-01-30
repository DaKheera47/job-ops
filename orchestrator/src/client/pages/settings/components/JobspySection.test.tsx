import type { UpdateSettingsInput } from "@shared/settings-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { JobspySection } from "./JobspySection";

const JobspyHarness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      jobspySites: ["indeed", "linkedin"],
      jobspyLocation: "UK",
      jobspyResultsWanted: 200,
      jobspyHoursOld: 72,
      jobspyCountryIndeed: "UK",
      jobspyLinkedinFetchDescription: true,
      jobspyIsRemote: false,
    },
  });

  return (
    <FormProvider {...methods}>
      <Accordion type="multiple" defaultValue={["jobspy"]}>
        <JobspySection
          values={{
            sites: {
              default: ["indeed", "linkedin"],
              effective: ["indeed", "linkedin"],
            },
            location: { default: "UK", effective: "UK" },
            resultsWanted: { default: 200, effective: 200 },
            hoursOld: { default: 72, effective: 72 },
            countryIndeed: { default: "UK", effective: "UK" },
            linkedinFetchDescription: { default: true, effective: true },
            isRemote: { default: false, effective: false },
          }}
          isLoading={false}
          isSaving={false}
        />
      </Accordion>
    </FormProvider>
  );
};

describe("JobspySection", () => {
  it("toggles scraped sites and keeps checkboxes in sync", () => {
    render(<JobspyHarness />);

    const indeedCheckbox = screen.getByLabelText("Indeed");
    const linkedinCheckbox = screen.getByLabelText("LinkedIn");

    expect(indeedCheckbox).toBeChecked();
    expect(linkedinCheckbox).toBeChecked();

    fireEvent.click(indeedCheckbox);
    expect(indeedCheckbox).not.toBeChecked();
    expect(linkedinCheckbox).toBeChecked();

    fireEvent.click(indeedCheckbox);
    expect(indeedCheckbox).toBeChecked();
  });

  it("clamps numeric inputs to allowed ranges", () => {
    render(<JobspyHarness />);

    const numericInputs = screen.getAllByRole("spinbutton");
    const resultsWantedInput = numericInputs[0];
    const hoursOldInput = numericInputs[1];

    fireEvent.change(resultsWantedInput, { target: { value: "1001" } });
    expect(resultsWantedInput).toHaveValue(1000);

    fireEvent.change(hoursOldInput, { target: { value: "0" } });
    expect(hoursOldInput).toHaveValue(1);
  });
});
