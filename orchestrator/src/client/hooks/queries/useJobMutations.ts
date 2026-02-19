import * as api from "@client/api";
import type { Job } from "@shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/client/lib/queryKeys";
import { invalidateJobData } from "./invalidate";

export function useUpdateJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: Partial<Job> }) =>
      api.updateJob(id, update),
    onSuccess: async (_data, variables) => {
      await invalidateJobData(queryClient, variables.id);
    },
  });
}

export function useMarkAsAppliedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markAsApplied(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.jobs.detail(id) });
      const previousJob = queryClient.getQueryData<Job>(
        queryKeys.jobs.detail(id),
      );
      queryClient.setQueryData<Job>(queryKeys.jobs.detail(id), (current) =>
        current ? { ...current, status: "applied" } : current,
      );
      return { previousJob, id };
    },
    onError: (_error, _id, context) => {
      if (context?.id) {
        queryClient.setQueryData(
          queryKeys.jobs.detail(context.id),
          context.previousJob,
        );
      }
    },
    onSettled: async (_data, _error, id) => {
      await invalidateJobData(queryClient, id);
    },
  });
}

export function useSkipJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.skipJob(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.jobs.detail(id) });
      const previousJob = queryClient.getQueryData<Job>(
        queryKeys.jobs.detail(id),
      );
      queryClient.setQueryData<Job>(queryKeys.jobs.detail(id), (current) =>
        current ? { ...current, status: "skipped" } : current,
      );
      return { previousJob, id };
    },
    onError: (_error, _id, context) => {
      if (context?.id) {
        queryClient.setQueryData(
          queryKeys.jobs.detail(context.id),
          context.previousJob,
        );
      }
    },
    onSettled: async (_data, _error, id) => {
      await invalidateJobData(queryClient, id);
    },
  });
}

export function useRescoreJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rescoreJob(id),
    onSuccess: async (_data, id) => {
      await invalidateJobData(queryClient, id);
    },
  });
}

export function useGenerateJobPdfMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generateJobPdf(id),
    onSuccess: async (_data, id) => {
      await invalidateJobData(queryClient, id);
    },
  });
}

export function useCheckSponsorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.checkSponsor(id),
    onSuccess: async (_data, id) => {
      await invalidateJobData(queryClient, id);
    },
  });
}
