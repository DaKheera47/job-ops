import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Shows a toast when a React Query `error` becomes non-null.
 * Deduplicates repeated firings for the same error message so the toast
 * does not reappear on every re-render while the query stays in error state.
 *
 * @param error   The `error` value from `useQuery` / `useInfiniteQuery`.
 * @param fallback  Fallback message used when the error is not an Error instance.
 */
export function useQueryErrorToast(error: unknown, fallback: string): void {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!error) {
      lastKeyRef.current = null;
      return;
    }
    const message = error instanceof Error ? error.message : fallback;
    if (lastKeyRef.current === message) return;
    lastKeyRef.current = message;
    toast.error(message);
  }, [error, fallback]);
}
