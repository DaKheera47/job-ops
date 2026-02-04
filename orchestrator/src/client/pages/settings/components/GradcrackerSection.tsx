import type { NumericSettingValues } from "@client/pages/settings/types";
import type React from "react";
import { NumericSettingSection } from "./NumericSettingSection";

type GradcrackerSectionProps = {
  values: NumericSettingValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const GradcrackerSection: React.FC<GradcrackerSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  return (
    <NumericSettingSection
      accordionValue="gradcracker"
      title="Gradcracker Extractor"
      fieldName="gradcrackerMaxJobsPerTerm"
      label="Max jobs per search term"
      helper={`Maximum number of jobs to fetch for EACH search term from Gradcracker. Default: ${values.default}. Range: 1-1000.`}
      values={values}
      min={1}
      max={1000}
      isLoading={isLoading}
      isSaving={isSaving}
    />
  );
};
