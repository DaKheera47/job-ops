import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import {
  Activity,
  CheckCircle2,
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

import { copyTextToClipboard } from "@client/lib/jobCopy";
import type { Job } from "@shared/types";

import { hubStateTokens, sourceLabel } from "./tokens";
import type { FlowActions, FlowNodeData, NodeStatus } from "./types";
import { formatDateTime, getEdgeStroke, resolveHubState, stripHtml } from "./utils";

const nodePositions = {
  headerInputs: { x: 40, y: 30 },
  headerGenerate: { x: 360, y: 30 },
  headerApply: { x: 700, y: 30 },
  headerOutcomes: { x: 1040, y: 30 },
  source: { x: 40, y: 120 },
  description: { x: 40, y: 250 },
  metadata: { x: 40, y: 400 },
  cv: { x: 360, y: 140 },
  cover: { x: 360, y: 260 },
  hub: { x: 700, y: 230 },
  notion: { x: 1040, y: 190 },
  oa: { x: 1040, y: 320 },
};

const buildNodes = (job: Job, onAction: (message: string) => void, actions: FlowActions) => {
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

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: "header-inputs",
      type: "stageHeader",
      position: nodePositions.headerInputs,
      data: { kind: "stage", label: "Inputs" },
      selectable: false,
      draggable: false,
    },
    {
      id: "header-generate",
      type: "stageHeader",
      position: nodePositions.headerGenerate,
      data: { kind: "stage", label: "Generate" },
      selectable: false,
      draggable: false,
    },
    {
      id: "header-apply",
      type: "stageHeader",
      position: nodePositions.headerApply,
      data: { kind: "stage", label: "Apply" },
      selectable: false,
      draggable: false,
    },
    {
      id: "header-outcomes",
      type: "stageHeader",
      position: nodePositions.headerOutcomes,
      data: { kind: "stage", label: "Outcomes" },
      selectable: false,
      draggable: false,
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
          logs: [job.status === "applied" ? "Artifacts locked for applied state." : "Tracking active."],
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
                2,
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

  return {
    nodes,
    statuses: {
      sourceStatus,
      descriptionStatus,
      metadataStatus,
      cvStatus,
      coverStatus,
      notionStatus,
      oaStatus,
    },
  };
};

const buildEdges = (statuses: {
  sourceStatus: NodeStatus;
  descriptionStatus: NodeStatus;
  metadataStatus: NodeStatus;
  cvStatus: NodeStatus;
  coverStatus: NodeStatus;
  notionStatus: NodeStatus;
  oaStatus: NodeStatus;
}) => {
  const edges: Edge[] = [
    {
      id: "e-source-cv",
      source: "source",
      sourceHandle: "out",
      target: "cv",
      targetHandle: "in",
      animated: true,
      style: { stroke: getEdgeStroke(statuses.sourceStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.sourceStatus) },
    },
    {
      id: "e-description-cover",
      source: "description",
      sourceHandle: "out",
      target: "cover",
      targetHandle: "in",
      animated: statuses.descriptionStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.descriptionStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.descriptionStatus) },
    },
    {
      id: "e-metadata-hub",
      source: "metadata",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-meta",
      animated: statuses.metadataStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.metadataStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.metadataStatus) },
    },
    {
      id: "e-cv-hub",
      source: "cv",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-cv",
      animated: statuses.cvStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.cvStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.cvStatus) },
    },
    {
      id: "e-cover-hub",
      source: "cover",
      sourceHandle: "out",
      target: "hub",
      targetHandle: "in-cover",
      animated: statuses.coverStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.coverStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.coverStatus) },
    },
    {
      id: "e-hub-notion",
      source: "hub",
      sourceHandle: "out-notion",
      target: "notion",
      targetHandle: "in",
      animated: statuses.notionStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.notionStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.notionStatus) },
    },
    {
      id: "e-hub-oa",
      source: "hub",
      sourceHandle: "out-outcome",
      target: "oa",
      targetHandle: "in",
      animated: statuses.oaStatus !== "missing",
      style: { stroke: getEdgeStroke(statuses.oaStatus), strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: getEdgeStroke(statuses.oaStatus) },
    },
  ];

  return edges;
};

export const buildFlow = (job: Job, onAction: (message: string) => void, actions: FlowActions) => {
  const { nodes, statuses } = buildNodes(job, onAction, actions);
  return { nodes, edges: buildEdges(statuses) };
};
