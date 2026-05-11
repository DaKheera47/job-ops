import { useEffect, useState } from "react";

export function useObjectUrl(createObjectUrl: () => Promise<string> | null): {
  objectUrl: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl: string | null = null;
    const promise = createObjectUrl();

    setObjectUrl(null);
    setError(null);

    if (!promise) {
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    void promise
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        nextObjectUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Preview unavailable.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [createObjectUrl]);

  return { objectUrl, isLoading, error };
}
