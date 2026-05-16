import { fetchWorkdayCxsJobs } from "@client/api/workday";
import { PageHeader, PageMain } from "@client/components/layout";
import { Eye, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

type WatchlistFetchState =
  | {
      status: "loading";
      careersUrl: string;
    }
  | {
      status: "success";
      careersUrl: string;
      cxsJobsUrl: string;
      response: unknown;
    }
  | {
      status: "error";
      careersUrl: string;
      cxsJobsUrl?: string;
      error: string;
    };

const WATCHLIST_URLS = [
  "https://autodesk.wd1.myworkdayjobs.com/Ext",
  "https://pg.wd5.myworkdayjobs.com/en-US/1000",
];

export const WatchlistPage: React.FC = () => {
  const [items, setItems] = useState<WatchlistFetchState[]>([]);
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchWatchlist() {
      setItems(
        WATCHLIST_URLS.map((careersUrl) => ({
          status: "loading",
          careersUrl,
        })),
      );

      await Promise.all(
        WATCHLIST_URLS.map(async (careersUrl) => {
          try {
            const result = await fetchWorkdayCxsJobs(careersUrl, 40);

            if (cancelled) return;

            setItems((current) =>
              current.map((item) =>
                item.careersUrl === careersUrl
                  ? { status: "success", ...result }
                  : item,
              ),
            );
          } catch (error) {
            if (cancelled) return;

            setItems((current) =>
              current.map((item) =>
                item.careersUrl === careersUrl
                  ? {
                      status: "error",
                      careersUrl,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  : item,
              ),
            );
          }
        }),
      );
    }

    void fetchWatchlist();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = items.filter(
    (item) => !dismissedUrls.has(item.careersUrl),
  );

  function dismiss(careersUrl: string) {
    setDismissedUrls((current) => {
      const next = new Set(current);
      next.add(careersUrl);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        icon={Eye}
        title="Watchlist"
        subtitle="Career pages you're watching"
      />

      <PageMain>
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div
              key={item.careersUrl}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.careersUrl}
                  </div>

                  {"cxsJobsUrl" in item && item.cxsJobsUrl ? (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {item.cxsJobsUrl}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.status === "loading" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking
                    </span>
                  ) : null}

                  {item.status === "success" ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                      Success
                    </span>
                  ) : null}

                  {item.status === "error" ? (
                    <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      Error
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => dismiss(item.careersUrl)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Dismiss ${item.careersUrl}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {item.status === "loading"
                  ? "Fetching Workday CXS response..."
                  : item.status === "error"
                    ? JSON.stringify(
                        {
                          careersUrl: item.careersUrl,
                          cxsJobsUrl: item.cxsJobsUrl,
                          error: item.error,
                        },
                        null,
                        2,
                      )
                    : JSON.stringify(
                        {
                          careersUrl: item.careersUrl,
                          cxsJobsUrl: item.cxsJobsUrl,
                          response: item.response,
                        },
                        null,
                        2,
                      )}
              </pre>
            </div>
          ))}

          {visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              All watchlist responses dismissed.
            </div>
          ) : null}
        </div>
      </PageMain>
    </>
  );
};
