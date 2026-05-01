import * as api from "@client/api";
import { subscribeToEventSource } from "@client/lib/sse";
import type {
  LinkedInApplyProgress,
  LinkedInBatchApplyProgress,
  LinkedInSessionStatus,
} from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@/client/lib/queryKeys";
import { invalidateJobData } from "./invalidate";

const LINKEDIN_SESSION_KEY = ["linkedin", "session", "status"] as const;

export function useLinkedInSessionStatus() {
  return useQuery<LinkedInSessionStatus>({
    queryKey: [...LINKEDIN_SESSION_KEY],
    queryFn: api.getLinkedInSessionStatus,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useStartLinkedInLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.startLinkedInLogin,
    onSuccess: (data) => {
      if (data.viewerUrl) {
        window.open(data.viewerUrl, "_blank", "noopener,noreferrer");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...LINKEDIN_SESSION_KEY] });
    },
  });
}

export function useVerifyLinkedInSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.verifyLinkedInSession,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...LINKEDIN_SESSION_KEY] });
    },
  });
}

export function useLogoutLinkedInMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.logoutLinkedIn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...LINKEDIN_SESSION_KEY] });
    },
  });
}

export function useEasyApplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      autoSubmit,
    }: {
      jobId: string;
      autoSubmit?: boolean;
    }) => api.startEasyApply(jobId, { autoSubmit }),
    onSuccess: (data) => {
      if (data.viewerUrl) {
        window.open(data.viewerUrl, "_blank", "noopener,noreferrer");
      }
    },
    onSettled: async (_data, _error, variables) => {
      await invalidateJobData(queryClient, variables.jobId);
    },
  });
}

export function useCancelEasyApplyMutation() {
  return useMutation({
    mutationFn: (jobId: string) => api.cancelEasyApply(jobId),
  });
}

export function useBatchApplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { jobIds: string[] } | { filter: "all_ready_linkedin" }) =>
      api.startBatchApply(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useCancelBatchApplyMutation() {
  return useMutation({
    mutationFn: api.cancelBatchApply,
  });
}

export function useBatchApplyProgress(): LinkedInBatchApplyProgress | null {
  const [progress, setProgress] = useState<LinkedInBatchApplyProgress | null>(null);
  const queryClient = useQueryClient();
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();

    unsubRef.current = subscribeToEventSource<LinkedInBatchApplyProgress>(
      "/api/linkedin-apply/batch-apply/progress",
      {
        onMessage: (data) => {
          setProgress(data);
          if (!data.running) {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
          }
        },
        onError: () => {},
      },
    );

    return cleanup;
  }, [queryClient, cleanup]);

  return progress;
}

export function useLinkedInApplyProgress(
  jobId: string | null,
): LinkedInApplyProgress | null {
  const [progress, setProgress] = useState<LinkedInApplyProgress | null>(null);
  const queryClient = useQueryClient();
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      cleanup();
      setProgress(null);
      return;
    }

    cleanup();

    unsubRef.current = subscribeToEventSource<LinkedInApplyProgress>(
      `/api/linkedin-apply/jobs/${jobId}/easy-apply/progress`,
      {
        onMessage: (data) => {
          setProgress(data);

          if (data.step === "completed") {
            invalidateJobData(queryClient, jobId);
          }
        },
        onError: () => {
          // SSE connection lost — not necessarily an error
        },
      },
    );

    return cleanup;
  }, [jobId, queryClient, cleanup]);

  return progress;
}
