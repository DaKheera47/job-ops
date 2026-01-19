import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  FileText,
  RefreshCcw,
  ScrollText,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyTextToClipboard, formatJobForWebhook } from "@client/lib/jobCopy";
import * as api from "../api";
import type { Job } from "../../shared/types";

type NodeStatus = "missing" | "in-progress" | "ready" | "failed";
type HubState = "discovered" | "qualified" | "prepared" | "applying" | "applied" | "in-progress" | "closed";

type IconType = React.ComponentType<{ className?: string }>;

interface NodeAction {
  id: string;
  label: string;
  icon: IconType;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}

interface InspectorData {
  title: string;
  subtitle?: string;
  status: NodeStatus;
  summary?: string;
  meta: Array<{ label: string; value: string | null }>;
  logs: string[];
  raw: Record<string, unknown>;
}

interface JobHubNodeData {
  kind: "hub";
  title: string;
  company: string;
  state: HubState;
  chips: string[];
  scoreLabel: string;
  actions?: NodeAction[];
  inspector: InspectorData;
}

interface JobPluginNodeData {
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

interface StageHeaderNodeData {
  kind: "stage";
  label: string;
}

type FlowNodeData = JobHubNodeData | JobPluginNodeData | StageHeaderNodeData;

const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

const nodeStatusTokens: Record<NodeStatus, { label: string; dot: string; text: string }> = {
  missing: {
    label: "Missing",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground/70",
  },
  "in-progress": {
    label: "In progress",
    dot: "bg-sky-400",
    text: "text-sky-400",
  },
  ready: {
    label: "Ready",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
  failed: {
    label: "Failed",
    dot: "bg-rose-400",
    text: "text-rose-400",
  },
};

const hubStateTokens: Record<HubState, { label: string; badge: string }> = {
  discovered: {
    label: "Discovered",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  },
  qualified: {
    label: "Qualified",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  prepared: {
    label: "Prepared",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  applying: {
    label: "Applying",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  },
  applied: {
    label: "Applied",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  "in-progress": {
    label: "In progress",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  closed: {
    label: "Closed",
    badge: "border-muted-foreground/20 bg-muted/20 text-muted-foreground",
  },
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "Not yet";
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    const time = parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const resolveHubState = (job: Job): HubState => {
  if (job.status === "skipped" || job.status === "expired") return "closed";
  if (job.status === "applied") return "applied";
  if (job.status === "ready") return job.applicationLink ? "applying" : "prepared";
  if (job.status === "processing") return "prepared";
  if (job.status === "discovered") {
    if (job.suitabilityScore != null && job.suitabilityScore >= 70) return "qualified";
    return "discovered";
  }
  return "discovered";
};

const getEdgeStroke = (status: NodeStatus) => {
  switch (status) {
    case "ready":
      return "#34d399";
    case "in-progress":
      return "#38bdf8";
    case "failed":
      return "#fb7185";
    case "missing":
    default:
      return "#64748b";
  }
};

const ActionPill: React.FC<{ action: NodeAction }> = ({ action }) => {
  const Icon = action.icon;
  const className = cn(
    "nodrag nopan inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground/80 transition-colors hover:border-border hover:text-foreground",
    action.disabled && "pointer-events-none opacity-50"
  );

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    action.onClick?.();
  };

  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={className}
      >
        <Icon className="h-3 w-3" />
        {action.label}
      </a>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={className} disabled={action.disabled}>
      <Icon className="h-3 w-3" />
      {action.label}
    </button>
  );
};

const JobHubNode: React.FC<NodeProps<JobHubNodeData>> = ({ data, selected }) => {
  const stateToken = hubStateTokens[data.state];
  const inPorts = [
    { id: "in-cv", label: "CV", top: 54 },
    { id: "in-cover", label: "Cover", top: 78 },
    { id: "in-meta", label: "Metadata", top: 102 },
  ];
  const outPorts = [
    { id: "out-notion", label: "Notion", top: 76 },
    { id: "out-outcome", label: "Outcome", top: 104 },
  ];

  return (
    <div
      className={cn(
        "relative w-[280px] rounded-lg border border-border/60 bg-muted/30 px-4 py-3 shadow-none",
        selected && "ring-2 ring-primary/40"
      )}
    >
      {inPorts.map((port) => (
        <React.Fragment key={port.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            style={{ top: port.top }}
            className="h-2 w-2 border border-background bg-muted-foreground/60"
            isConnectable={false}
          />
          <span
            className="pointer-events-none absolute -left-16 text-[9px] text-muted-foreground/70"
            style={{ top: port.top - 6 }}
          >
            {port.label}
          </span>
        </React.Fragment>
      ))}

      {outPorts.map((port) => (
        <React.Fragment key={port.id}>
          <Handle
            type="source"
            position={Position.Right}
            id={port.id}
            style={{ top: port.top }}
            className="h-2 w-2 border border-background bg-muted-foreground/60"
            isConnectable={false}
          />
          <span
            className="pointer-events-none absolute -right-16 text-[9px] text-muted-foreground/70 text-right"
            style={{ top: port.top - 6 }}
          >
            {port.label}
          </span>
        </React.Fragment>
      ))}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          <div className="text-xs text-muted-foreground">{data.company}</div>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
            stateToken.badge
          )}
        >
          {stateToken.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {data.chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/80"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/70">
        <div className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-medium text-foreground/80">{data.scoreLabel}</span>
        </div>
      </div>

      {data.actions && data.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.actions.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};

const JobPluginNode: React.FC<NodeProps<JobPluginNodeData>> = ({ data, selected }) => {
  const statusToken = nodeStatusTokens[data.status];
  const Icon = data.icon;
  const showInput = Boolean(data.inputHandle);
  const showOutput = Boolean(data.outputHandle);

  return (
    <div
      className={cn(
        "w-[280px] rounded-lg border border-border/60 bg-muted/30 px-3 py-2 shadow-none",
        selected && "ring-2 ring-primary/40"
      )}
    >
      {showInput && (
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          style={{ top: "50%" }}
          className="h-2 w-2 border border-background bg-muted-foreground/60"
          isConnectable={false}
        />
      )}
      {showOutput && (
        <Handle
          type="source"
          id="out"
          position={Position.Right}
          style={{ top: "50%" }}
          className="h-2 w-2 border border-background bg-muted-foreground/60"
          isConnectable={false}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusToken.dot)} />
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />}
          <div>
            <div className="text-xs font-semibold">{data.title}</div>
            {data.subtitle && <div className="text-[10px] text-muted-foreground/70">{data.subtitle}</div>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </div>

      <div className="mt-1 text-[10px] text-muted-foreground/70">Updated {data.updatedAt}</div>

      {data.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.actions.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};

const StageHeaderNode: React.FC<NodeProps<StageHeaderNodeData>> = ({ data }) => (
  <div className="w-[280px] rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
    {data.label}
  </div>
);

const InspectorPanel: React.FC<{ data?: InspectorData }> = ({ data }) => {
  if (!data) {
    return (
      <div className="text-xs text-muted-foreground/70">
        Select a node to inspect raw JSON, metadata, and logs.
      </div>
    );
  }

  const statusToken = nodeStatusTokens[data.status];
  const rawJson = JSON.stringify(data.raw, null, 2);

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusToken.dot)} />
          <div className="text-sm font-semibold text-foreground">{data.title}</div>
        </div>
        {data.subtitle && <div className="text-[11px] text-muted-foreground">{data.subtitle}</div>}
        {data.summary && <div className="text-[11px] text-muted-foreground/80">{data.summary}</div>}
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Metadata</div>
        <div className="mt-2 space-y-1">
          {data.meta.length === 0 && (
            <div className="text-[11px] text-muted-foreground/70">No metadata captured.</div>
          )}
          {data.meta.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground/70">{item.label}</div>
              <div className="text-[11px] font-mono tabular-nums text-foreground/80">
                {item.value || "-"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Raw JSON</div>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground font-mono">
{rawJson}
        </pre>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Logs</div>
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground/80">
          {data.logs.length === 0 && <div>No log entries yet.</div>}
          {data.logs.map((log, index) => (
            <div key={`${log}-${index}`}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface FlowActions {
  onGenerateCv?: () => void;
  onMarkApplied?: () => void;
  onSendWebhook?: () => void;
  isGeneratingCv?: boolean;
  isApplying?: boolean;
  isSendingWebhook?: boolean;
}

const buildFlow = (job: Job, onAction: (message: string) => void, actions: FlowActions) => {
  const sourceUrl = job.jobUrlDirect || job.jobUrl;
  const applyUrl = job.applicationLink || job.jobUrl;
  const pdfHref = job.pdfPath
    ? `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`
    : null;
  const descriptionText = job.jobDescription
    ? job.jobDescription.includes("<")
      ? stripHtml(job.jobDescription)
      : job.jobDescription
    : "";
  const descriptionLength = descriptionText ? `${descriptionText.length} chars` : "No snapshot";
  const remoteLabel =
    job.isRemote === true ? "Remote" : job.isRemote === false ? "On-site" : job.workFromHomeType || "Remote unknown";
  const locationLabel = job.location ? `${job.location} / ${remoteLabel}` : `Location unknown / ${remoteLabel}`;
  const visaChip = "Unknown";
  const scoreLabel = job.suitabilityScore != null ? `${job.suitabilityScore}% match` : "No score";
  const sourceStatus: NodeStatus = sourceUrl ? "ready" : "missing";
  const descriptionStatus: NodeStatus = job.jobDescription ? "ready" : "missing";
  const metadataStatus: NodeStatus = job.deadline || job.salary || job.jobType ? "ready" : "missing";
  const cvStatus: NodeStatus = actions.isGeneratingCv
    ? "in-progress"
    : job.pdfPath
      ? "ready"
      : job.status === "processing"
        ? "in-progress"
        : "missing";
  const coverStatus: NodeStatus = "missing";
  const notionStatus: NodeStatus = job.notionPageId ? "ready" : "missing";
  const oaStatus: NodeStatus = "missing";

  const hubState = resolveHubState(job);

  const nodePositions = {
    headerInputs: { x: 40, y: 40 },
    headerGenerate: { x: 380, y: 40 },
    headerApply: { x: 720, y: 40 },
    headerOutcomes: { x: 1060, y: 40 },
    source: { x: 40, y: 120 },
    description: { x: 40, y: 240 },
    metadata: { x: 40, y: 480 },
    cv: { x: 380, y: 140 },
    cover: { x: 380, y: 260 },
    hub: { x: 720, y: 200 },
    notion: { x: 1060, y: 180 },
    oa: { x: 1060, y: 320 },
  };

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: "header-inputs",
      type: "stageHeader",
      position: nodePositions.headerInputs,
      data: { kind: "stage", label: "Inputs" },
      selectable: false,
    },
    {
      id: "header-generate",
      type: "stageHeader",
      position: nodePositions.headerGenerate,
      data: { kind: "stage", label: "Generate" },
      selectable: false,
    },
    {
      id: "header-apply",
      type: "stageHeader",
      position: nodePositions.headerApply,
      data: { kind: "stage", label: "Apply" },
      selectable: false,
    },
    {
      id: "header-outcomes",
      type: "stageHeader",
      position: nodePositions.headerOutcomes,
      data: { kind: "stage", label: "Outcomes" },
      selectable: false,
    },
    {
      id: "hub",
      type: "jobHub",
      position: nodePositions.hub,
      data: {
        kind: "hub",
        title: job.title,
        company: job.employer,
        state: hubState,
        chips: [
          `Source: ${sourceLabel[job.source]}`,
          `Location: ${locationLabel}`,
          `Visa: ${visaChip}`,
          `Match: ${job.suitabilityScore ?? "--"}%`,
        ],
        scoreLabel,
        actions: [
          {
            id: "open-apply",
            label: "Open link",
            icon: ExternalLink,
            href: applyUrl || undefined,
            disabled: !applyUrl,
          },
          {
            id: "copy-apply",
            label: "Copy link",
            icon: Copy,
            onClick: () => {
              if (!applyUrl) return;
              void copyTextToClipboard(applyUrl).then(() => toast.success("Apply link copied"));
            },
            disabled: !applyUrl,
          },
          {
            id: "mark-applied",
            label: job.status === "applied" ? "Applied" : "Mark applied",
            icon: CheckCircle2,
            onClick: actions.onMarkApplied,
            disabled: job.status === "applied" || !actions.onMarkApplied || actions.isApplying,
          },
        ],
        inspector: {
          title: "Job hub",
          subtitle: `${job.title} - ${job.employer}`,
          status: hubState === "closed" ? "failed" : hubState === "applied" ? "ready" : "in-progress",
          summary: "Apply stage with job context. Artifacts freeze when Applied.",
          meta: [
            { label: "State", value: hubStateTokens[hubState].label },
            { label: "Source", value: sourceLabel[job.source] },
            { label: "Discovered", value: formatDateTime(job.discoveredAt) },
            { label: "Updated", value: formatDateTime(job.updatedAt) },
            { label: "Apply URL", value: applyUrl },
          ],
          logs: [
            job.status === "applied" ? "Artifacts locked for applied state." : "Tracking active.",
          ],
          raw: {
            id: job.id,
            status: job.status,
            score: job.suitabilityScore,
            appliedAt: job.appliedAt,
          },
        },
      },
    },
    {
      id: "source",
      type: "jobPlugin",
      position: nodePositions.source,
      data: {
        kind: "plugin",
        title: "Source",
        subtitle: `${sourceLabel[job.source]} Extractor`,
        status: sourceStatus,
        updatedAt: formatDateTime(job.discoveredAt),
        icon: ScrollText,
        outputHandle: true,
        actions: [
          {
            id: "open-source",
            label: "Open original",
            icon: ExternalLink,
            href: sourceUrl || undefined,
            disabled: !sourceUrl,
          },
          {
            id: "copy-source",
            label: "Copy URL",
            icon: Copy,
            onClick: () => {
              if (!sourceUrl) return;
              void copyTextToClipboard(sourceUrl).then(() => toast.success("Source URL copied"));
            },
            disabled: !sourceUrl,
          },
        ],
        inspector: {
          title: "Source node",
          subtitle: `${sourceLabel[job.source]} Extractor`,
          status: sourceStatus,
          summary: "Original listing data captured from the source.",
          meta: [
            { label: "Original URL", value: sourceUrl },
            { label: "Scraped", value: formatDateTime(job.discoveredAt) },
            { label: "Deadline", value: job.deadline ? formatDateTime(job.deadline) : null },
            { label: "Salary", value: job.salary },
          ],
          logs: sourceUrl ? ["Source URL captured."] : ["No source URL stored."],
          raw: {
            source: job.source,
            sourceJobId: job.sourceJobId,
            jobUrl: job.jobUrl,
            jobUrlDirect: job.jobUrlDirect,
          },
        },
      },
    },
    {
      id: "description",
      type: "jobPlugin",
      position: nodePositions.description,
      data: {
        kind: "plugin",
        title: "Job description",
        subtitle: "Snapshot",
        status: descriptionStatus,
        updatedAt: formatDateTime(job.updatedAt),
        icon: FileText,
        outputHandle: true,
        actions: [
          {
            id: "copy-jd",
            label: "Copy JD",
            icon: Clipboard,
            onClick: () => {
              if (!descriptionText) return;
              void copyTextToClipboard(descriptionText).then(() => toast.success("Job description copied"));
            },
            disabled: !descriptionText,
          },
          {
            id: "diff-jd",
            label: "Diff latest",
            icon: Activity,
            onClick: () => onAction("Diff against latest not available yet."),
          },
        ],
        inspector: {
          title: "Job description",
          subtitle: "Snapshot stored",
          status: descriptionStatus,
          summary: "Locked snapshot once Applied to prevent confusion later.",
          meta: [
            { label: "Snapshot length", value: descriptionLength },
            { label: "Updated", value: formatDateTime(job.updatedAt) },
          ],
          logs: job.jobDescription ? ["Snapshot stored."] : ["No job description saved yet."],
          raw: {
            description: descriptionText.slice(0, 200),
          },
        },
      },
    },
    {
      id: "metadata",
      type: "jobPlugin",
      position: nodePositions.metadata,
      data: {
        kind: "plugin",
        title: "Metadata",
        subtitle: "Parsed fields",
        status: metadataStatus,
        updatedAt: formatDateTime(job.updatedAt),
        icon: Sparkles,
        outputHandle: true,
        actions: [
          {
            id: "copy-metadata",
            label: "Copy",
            icon: Copy,
            onClick: () => {
              const payload = JSON.stringify(
                {
                  deadline: job.deadline,
                  salary: job.salary,
                  jobType: job.jobType,
                  jobLevel: job.jobLevel,
                },
                null,
                2
              );
              void copyTextToClipboard(payload).then(() => toast.success("Metadata copied"));
            },
          },
        ],
        inspector: {
          title: "Metadata",
          subtitle: "Parsed fields",
          status: metadataStatus,
          summary: "Parsed fields captured from the listing.",
          meta: [
            { label: "Deadline", value: job.deadline ? formatDateTime(job.deadline) : null },
            { label: "Salary", value: job.salary },
            { label: "Job type", value: job.jobType },
            { label: "Job level", value: job.jobLevel },
          ],
          logs: ["Metadata synced from source."],
          raw: {
            deadline: job.deadline,
            salary: job.salary,
            jobType: job.jobType,
            jobLevel: job.jobLevel,
          },
        },
      },
    },
    {
      id: "cv",
      type: "jobPlugin",
      position: nodePositions.cv,
      data: {
        kind: "plugin",
        title: "Tailored CV",
        subtitle: "PDF + JSON",
        status: cvStatus,
        updatedAt: job.processedAt ? formatDateTime(job.processedAt) : "Not generated",
        icon: FileText,
        inputHandle: true,
        outputHandle: true,
        actions: [
          {
            id: "download-cv",
            label: "Download",
            icon: Download,
            href: pdfHref || undefined,
            disabled: !pdfHref,
          },
          {
            id: "open-cv",
            label: "Open",
            icon: ExternalLink,
            href: pdfHref || undefined,
            disabled: !pdfHref,
          },
          {
            id: "regen-cv",
            label: "Regenerate",
            icon: RefreshCcw,
            onClick: actions.onGenerateCv,
            disabled: !actions.onGenerateCv || actions.isGeneratingCv,
          },
        ],
        inspector: {
          title: "Tailored CV",
          subtitle: "ATS-ready snapshot",
          status: cvStatus,
          summary: "PDF and JSON snapshot locked when Applied.",
          meta: [
            { label: "Filename", value: job.pdfPath || null },
            { label: "Generated", value: job.processedAt ? formatDateTime(job.processedAt) : null },
            { label: "ATS friendly", value: job.pdfPath ? "Yes" : "-" },
          ],
          logs: job.pdfPath ? ["PDF generated."] : ["No CV generated yet."],
          raw: {
            pdfPath: job.pdfPath,
            processedAt: job.processedAt,
          },
        },
      },
    },
    {
      id: "cover",
      type: "jobPlugin",
      position: nodePositions.cover,
      data: {
        kind: "plugin",
        title: "Cover letter",
        subtitle: "Optional",
        status: coverStatus,
        updatedAt: "Not generated",
        icon: ScrollText,
        inputHandle: true,
        outputHandle: true,
        actions: [
          {
            id: "generate-cover",
            label: "Generate",
            icon: Sparkles,
            onClick: () => onAction("Cover letter generation queued."),
          },
          {
            id: "edit-cover",
            label: "Edit",
            icon: FileText,
            onClick: () => onAction("Cover letter editor not configured."),
          },
        ],
        inspector: {
          title: "Cover letter",
          subtitle: "Optional",
          status: coverStatus,
          summary: "Draft, revise, and lock when applied.",
          meta: [{ label: "Status", value: "Missing" }],
          logs: ["No cover letter generated."],
          raw: {},
        },
      },
    },
    {
      id: "notion",
      type: "jobPlugin",
      position: nodePositions.notion,
      data: {
        kind: "plugin",
        title: "Notion entry",
        subtitle: "Webhook sync",
        status: notionStatus,
        updatedAt: job.notionPageId ? formatDateTime(job.updatedAt) : "Not synced",
        icon: Send,
        inputHandle: true,
        actions: [
          {
            id: "send-webhook",
            label: "Send webhook",
            icon: Send,
            onClick: actions.onSendWebhook,
            disabled: !actions.onSendWebhook || actions.isSendingWebhook,
          },
        ],
        inspector: {
          title: "Notion entry",
          subtitle: "Webhook sync",
          status: notionStatus,
          summary: "Create or refresh the Notion job entry.",
          meta: [{ label: "Notion ID", value: job.notionPageId }],
          logs: job.notionPageId ? ["Notion entry created."] : ["Notion webhook not sent yet."],
          raw: {
            notionPageId: job.notionPageId,
          },
        },
      },
    },
    {
      id: "oa",
      type: "jobPlugin",
      position: nodePositions.oa,
      data: {
        kind: "plugin",
        title: "Got OA",
        subtitle: "Outcome",
        status: oaStatus,
        updatedAt: job.appliedAt ? formatDateTime(job.appliedAt) : "No outcome",
        icon: Activity,
        inputHandle: true,
        actions: [
          {
            id: "add-outcome",
            label: "Add outcome",
            icon: FileText,
            onClick: () => onAction("Outcome note not configured."),
          },
          {
            id: "attach-email",
            label: "Attach email",
            icon: ExternalLink,
            onClick: () => onAction("Email attachments not configured."),
          },
        ],
        inspector: {
          title: "Outcome",
          subtitle: "OA + interview timeline",
          status: oaStatus,
          summary: "Track OA, interview, and offer events.",
          meta: [
            { label: "Last update", value: job.appliedAt ? formatDateTime(job.appliedAt) : null },
            { label: "Stage", value: "Awaiting reply" },
          ],
          logs: ["No outcomes recorded yet."],
          raw: {
            appliedAt: job.appliedAt,
          },
        },
      },
    },
  ];

  const edges: Edge[] = [
    {
      id: "e-source-cv",
      source: "source",
      sourceHandle: "out",
      target: "cv",
      targetHandle: "in",
      animated: true,
      style: { stroke: getEdgeStroke(sourceStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(sourceStatus) },
    },
    {
      id: "e-description-cover",
      source: "description",
      sourceHandle: "out",
      target: "cover",
      targetHandle: "in",
      animated: descriptionStatus !== "missing",
      style: { stroke: getEdgeStroke(descriptionStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(descriptionStatus) },
    },
    {
      id: "e-metadata-hub",
      source: "metadata",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-meta",
      animated: metadataStatus !== "missing",
      style: { stroke: getEdgeStroke(metadataStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(metadataStatus) },
    },
    {
      id: "e-cv-hub",
      source: "cv",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-cv",
      animated: cvStatus !== "missing",
      style: { stroke: getEdgeStroke(cvStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(cvStatus) },
    },
    {
      id: "e-cover-hub",
      source: "cover",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-cover",
      animated: coverStatus !== "missing",
      style: { stroke: getEdgeStroke(coverStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(coverStatus) },
    },
    {
      id: "e-hub-notion",
      source: "hub",
      sourceHandle: "out-notion",
      target: "notion",
      targetHandle: "in",
      animated: notionStatus !== "missing",
      style: { stroke: getEdgeStroke(notionStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(notionStatus) },
    },
    {
      id: "e-hub-oa",
      source: "hub",
      sourceHandle: "out-outcome",
      target: "oa",
      targetHandle: "in",
      animated: oaStatus !== "missing",
      style: { stroke: getEdgeStroke(oaStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(oaStatus) },
    },
  ];

  return { nodes, edges };
};

interface JobFlowModalProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobUpdated?: () => void | Promise<void>;
}

export const JobFlowModal: React.FC<JobFlowModalProps> = ({
  job,
  open,
  onOpenChange,
  onJobUpdated,
}) => {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isGeneratingCv, setIsGeneratingCv] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);

  const handleAction = useCallback((message: string) => {
    toast.message(message);
  }, []);

  useEffect(() => {
    setIsGeneratingCv(false);
    setIsApplying(false);
    setIsSendingWebhook(false);
  }, [job?.id]);

  const handleGenerateCv = useCallback(async () => {
    if (!job || isGeneratingCv) return;
    if (job.status === "processing") {
      toast.message("Resume generation already in progress.");
      return;
    }
    try {
      setIsGeneratingCv(true);
      if (job.status === "ready") {
        await api.generateJobPdf(job.id);
        toast.success("PDF regenerated");
      } else {
        await api.processJob(job.id);
        toast.success("Resume generated");
      }
      await onJobUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate resume";
      toast.error(message);
    } finally {
      setIsGeneratingCv(false);
    }
  }, [job, isGeneratingCv, onJobUpdated]);

  const handleMarkApplied = useCallback(async () => {
    if (!job || isApplying) return;
    if (job.status === "applied") {
      toast.message("Job already marked applied.");
      return;
    }
    try {
      setIsApplying(true);
      await api.markAsApplied(job.id);
      toast.success("Marked as applied");
      await onJobUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark applied";
      toast.error(message);
    } finally {
      setIsApplying(false);
    }
  }, [job, isApplying, onJobUpdated]);

  const handleSendWebhook = useCallback(async () => {
    if (!job || isSendingWebhook) return;
    try {
      setIsSendingWebhook(true);
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Webhook payload copied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy webhook payload";
      toast.error(message);
    } finally {
      setIsSendingWebhook(false);
    }
  }, [job, isSendingWebhook]);

  const flow = useMemo(() => {
    if (!job) return { nodes: [] as Array<Node<FlowNodeData>>, edges: [] as Edge[] };
    return buildFlow(job, handleAction, {
      onGenerateCv: handleGenerateCv,
      onMarkApplied: handleMarkApplied,
      onSendWebhook: handleSendWebhook,
      isGeneratingCv,
      isApplying,
      isSendingWebhook,
    });
  }, [
    job,
    handleAction,
    handleGenerateCv,
    handleMarkApplied,
    handleSendWebhook,
    isGeneratingCv,
    isApplying,
    isSendingWebhook,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    if (!job) return;
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setActiveNodeId("hub");
  }, [flow.nodes, flow.edges, job, setNodes, setEdges]);

  useEffect(() => {
    if (!open) setActiveNodeId("hub");
  }, [open]);

  const selectedNode = nodes.find((node) => node.id === activeNodeId) ?? nodes[0];
  const inspector = selectedNode?.data?.inspector;

  if (!job) return null;

  const applyUrl = job.applicationLink || job.jobUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1400px)] p-0">
        <div className="flex h-[min(90vh,860px)] flex-col">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">
                {job.title}
              </DialogTitle>
              <div className="text-xs text-muted-foreground">{job.employer}</div>
            </div>
            <div className="flex items-center gap-2">
              {applyUrl && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                    Open apply link
                  </a>
                </Button>
              )}
              <DialogClose asChild>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                  Close
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 border-r border-border/60 bg-muted/5">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(_, node) => {
                  if (node.type === "stageHeader") return;
                  setActiveNodeId(node.id);
                }}
                nodeTypes={{ jobHub: JobHubNode, jobPlugin: JobPluginNode, stageHeader: StageHeaderNode }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.5}
                maxZoom={1.2}
                defaultEdgeOptions={{ type: "bezier" }}
              >
                <Background gap={20} size={1} color="rgba(148, 163, 184, 0.15)" />
                <Controls position="bottom-left" />
              </ReactFlow>
            </div>

            <aside className="w-[320px] shrink-0 overflow-y-auto bg-muted/10 p-4">
              <InspectorPanel data={inspector} />
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
