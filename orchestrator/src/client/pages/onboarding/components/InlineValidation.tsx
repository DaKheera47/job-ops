import type React from "react";
import type { ValidationState } from "../types";

export const InlineValidation: React.FC<{ state: ValidationState }> = ({
  state,
}) => {
  if (!state.checked || state.valid || !state.message) return null;

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {state.message}
    </div>
  );
};
