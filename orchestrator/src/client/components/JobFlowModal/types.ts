import type React from "react";

export type NodeStatus = "missing" | "in-progress" | "ready" | "failed";
export type HubState = "discovered" | "qualified" | "prepared" | "applying" | "applied" | "in-progress" | "closed";

export type IconType = React.ComponentType<{ className?: string }>;

export interface NodeAction {
  id: string;
  label: string;
  icon: IconType;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface InspectorData {
  title: string;
  subtitle?: string;
  status: NodeStatus;
  summary?: string;
  meta: Array<{ label: string; value: string | null }>;
  logs: string[];
  raw: Record<string, unknown>;
}

export interface JobHubNodeData {
  kind: "hub";
  title: string;
  company: string;
  state: HubState;
  chips: string[];
  scoreLabel: string;
  actions?: NodeAction[];
  inspector: InspectorData;
}

export interface JobPluginNodeData {
  kind: "plugin";
  title: string;
  subtitle?: string;
  status: NodeStatus;
  updatedAt: string;
  actions: NodeAction[];
  icon?: IconType;
  inputHandle?: boolean;
  outputHandle?: boolean;
  inspector: InspectorData;
}

export interface StageHeaderNodeData {
  kind: "stage";
  label: string;
}

export type FlowNodeData = JobHubNodeData | JobPluginNodeData | StageHeaderNodeData;

export interface FlowActions {
  onGenerateCv?: () => void;
  onMarkApplied?: () => void;
  onSendWebhook?: () => void;
  isGeneratingCv?: boolean;
  isApplying?: boolean;
  isSendingWebhook?: boolean;
}
