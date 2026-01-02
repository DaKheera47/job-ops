/**
 * Main App component.
 */

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import type { Job, JobSource, JobStatus } from "../shared/types";
import { Header, JobList, PipelineProgress, Stats } from "./components";
import * as api from "./api";
import { SettingsPage } from "./pages/SettingsPage";

const DEFAULT_PIPELINE_SOURCES: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];
const PIPELINE_SOURCES_STORAGE_KEY = "jobops.pipeline.sources";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Record<JobStatus, number>>({
    discovered: 0,
    processing: 0,
    ready: 0,
    applied: 0,
    rejected: 0,
    expired: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw) return DEFAULT_PIPELINE_SOURCES;
      const parsed = JSON.parse(raw) as unknown;
      const allowed: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];
      if (!Array.isArray(parsed)) return DEFAULT_PIPELINE_SOURCES;
      const next = parsed.filter((value): value is JobSource => allowed.includes(value));
      return next.length > 0 ? next : DEFAULT_PIPELINE_SOURCES;
    } catch {
      return DEFAULT_PIPELINE_SOURCES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_SOURCES_STORAGE_KEY, JSON.stringify(pipelineSources));
    } catch {
      // Ignore localStorage errors
    }
  }, [pipelineSources]);

  const loadJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getJobs();
      setJobs(data.jobs);
      setStats(data.byStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load jobs";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkPipelineStatus = useCallback(async () => {
    try {
      const status = await api.getPipelineStatus();
      setIsPipelineRunning(status.isRunning);
    } catch {
      // Ignore errors
    }
  }, []);

  useEffect(() => {
    loadJobs();
    checkPipelineStatus();

    const interval = setInterval(() => {
      loadJobs();
      checkPipelineStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadJobs, checkPipelineStatus]);

  const handleRunPipeline = async () => {
    try {
      setIsPipelineRunning(true);
      await api.runPipeline({ sources: pipelineSources });
      toast.message("Pipeline started", {
        description: `Sources: ${pipelineSources.join(", ")}. This may take a few minutes.`,
      });

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getPipelineStatus();
          if (!status.isRunning) {
            clearInterval(pollInterval);
            setIsPipelineRunning(false);
            await loadJobs();
            toast.success("Pipeline completed");
          }
        } catch {
          // Ignore errors
        }
      }, 5000);
    } catch (error) {
      setIsPipelineRunning(false);
      const message = error instanceof Error ? error.message : "Failed to start pipeline";
      toast.error(message);
    }
  };

  const handleProcess = async (jobId: string) => {
    try {
      setProcessingJobId(jobId);
      const job = jobs.find((item) => item.id === jobId);
      const force = job?.status === "ready";
      await api.processJob(jobId, { force });
      toast.success(force ? "Resume regenerated successfully" : "Resume generated successfully");
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process job";
      toast.error(message);
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleApply = async (jobId: string) => {
    try {
      await api.markAsApplied(jobId);
      toast.success("Marked as applied");
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark as applied";
      toast.error(message);
    }
  };

  const handleReject = async (jobId: string) => {
    try {
      await api.rejectJob(jobId);
      toast.message("Job skipped");
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reject job";
      toast.error(message);
    }
  };

  const handleClearDatabase = async () => {
    try {
      const result = await api.clearDatabase();
      toast.success("Database cleared", { description: `Deleted ${result.jobsDeleted} jobs.` });
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear database";
      toast.error(message);
    }
  };

  return (
    <>
      <Header
        onRunPipeline={handleRunPipeline}
        onRefresh={loadJobs}
        onClearDatabase={handleClearDatabase}
        isPipelineRunning={isPipelineRunning}
        isLoading={isLoading}
        pipelineSources={pipelineSources}
        onPipelineSourcesChange={setPipelineSources}
      />

      <Routes>
        <Route
          path="/"
          element={
            <main className="container mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12">
              <PipelineProgress isRunning={isPipelineRunning} />
              <Stats stats={stats} />
              <JobList
                jobs={jobs}
                onApply={handleApply}
                onReject={handleReject}
                onProcess={handleProcess}
                processingJobId={processingJobId}
              />
            </main>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};
