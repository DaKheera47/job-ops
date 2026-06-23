import type React from "react";

export type OrchestratorFilterBarProps = {
  children: React.ReactNode;
};

export const OrchestratorFilterBar: React.FC<OrchestratorFilterBarProps> = ({
  children,
}) => (
  <div
    id="orchestrator-filter-bar"
    className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto rounded-full bg-muted p-2 [&>*]:shrink-0"
  >
    {children}
  </div>
);
