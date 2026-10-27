import { useUiTranslation } from "@client/lib/i18n/language";
import { CheckCircle2 } from "lucide-react";
import type React from "react";
import type { ValidationState } from "../types";

export const InlineValidation: React.FC<{
  state: ValidationState;
  successMessage?: string;
}> = ({ state, successMessage }) => {
  const { t: uiT } = useUiTranslation();
  if (state.valid && state.hydrated && successMessage) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{uiT(successMessage)}</div>
      </div>
    );
  }

  if (!state.checked || state.valid || !state.message) return null;

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {uiT(state.message)}
    </div>
  );
};
