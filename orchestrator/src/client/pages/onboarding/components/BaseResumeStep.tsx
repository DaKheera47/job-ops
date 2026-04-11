import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection";
import type React from "react";
import type { ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

export const BaseResumeStep: React.FC<{
  baseResumeValidation: ValidationState;
  hasRxResumeAccess: boolean;
  isBusy: boolean;
  value: string | null;
  onValueChange: (value: string | null) => void;
}> = ({
  baseResumeValidation,
  hasRxResumeAccess,
  isBusy,
  onValueChange,
  value,
}) => (
  <div className="space-y-6">
    <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
      The template resume is what tailoring starts from every time. Pick the
      version that already reflects the voice, structure, and sections you want
      Job Ops to preserve.
    </div>
    <BaseResumeSelection
      value={value}
      onValueChange={onValueChange}
      hasRxResumeAccess={hasRxResumeAccess}
      disabled={isBusy}
    />
    {!hasRxResumeAccess && (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
        Finish the RxResume step first so Job Ops can load the list of available
        resumes.
      </div>
    )}
    <InlineValidation state={baseResumeValidation} />
  </div>
);
