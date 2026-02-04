import type { NumericSettingValues } from "@client/pages/settings/types";
import type React from "react";
import { NumericSettingSection } from "./NumericSettingSection";

type UkvisajobsSectionProps = {
  values: NumericSettingValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const UkvisajobsSection: React.FC<UkvisajobsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  return (
    <NumericSettingSection
      accordionValue="ukvisajobs"
      title="UKVisaJobs Extractor"
      fieldName="ukvisajobsMaxJobs"
      label="Max jobs to fetch"
      helper={`Maximum number of jobs to fetch from UKVisaJobs per pipeline run. Default: ${values.default}. Range: 1-1000.`}
      values={values}
      min={1}
      max={1000}
      isLoading={isLoading}
      isSaving={isSaving}
    />
  );
};
