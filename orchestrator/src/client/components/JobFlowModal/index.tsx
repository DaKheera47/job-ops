import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard, formatJobForWebhook } from "@client/lib/jobCopy";
import type { Job } from "@shared/types";

import * as api from "../../api";
import { buildFlow } from "./buildFlow";
import type { FlowNodeData } from "./types";
import { InspectorPanel, JobHubNode, JobPluginNode, StageHeaderNode } from "./nodes";
import { usePersistentFlowPositions } from "./hooks/usePersistentFlowPositions";

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

  const { applyPositions, persistPositions, resetPositions } = usePersistentFlowPositions({
    jobId: job?.id ?? null,
  });

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

  const handleResetLayout = useCallback(() => {
    resetPositions();
    setNodes(flow.nodes);
  }, [resetPositions, setNodes, flow.nodes]);

  useEffect(() => {
    if (!job) return;
    setNodes((prev) => applyPositions(flow.nodes, prev));
    setEdges(flow.edges);
    setActiveNodeId("hub");
  }, [flow.nodes, flow.edges, job, setNodes, setEdges, applyPositions]);

  useEffect(() => {
    if (!open) setActiveNodeId("hub");
  }, [open]);

  useEffect(() => {
    if (nodes.length === 0) return;
    persistPositions(nodes);
  }, [nodes, persistPositions]);

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
              <DialogTitle className="truncate text-base font-semibold">{job.title}</DialogTitle>
              <div className="text-xs text-muted-foreground">{job.employer}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleResetLayout}>
                Reset layout
              </Button>
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
                nodeTypes={{
                  jobHub: JobHubNode,
                  jobPlugin: JobPluginNode,
                  stageHeader: StageHeaderNode,
                }}
                nodesDraggable
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
