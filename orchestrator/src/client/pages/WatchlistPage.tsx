import { getJobsFromCxs } from "@career-boards/workday/get-jobs-from-cxs";
import { workdayUrlToCxsJobsUrl } from "@career-boards/workday/workday-url-to-cxs";
import { PageHeader, PageMain } from "@client/components/layout";
import { Eye, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

type WatchlistFetchState =
  | {
      status: "loading";
      careersUrl: string;
      cxsJobsUrl: string;
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

export const WatchlistPage: React.FC = () => {
  const watchlist = useMemo(
    () => [
      "https://autodesk.wd1.myworkdayjobs.com/Ext",
      "https://pg.wd5.myworkdayjobs.com/en-US/1000",
    ],
    [],
  );

  const [items, setItems] = useState<WatchlistFetchState[]>([]);
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchWatchlist() {
      const initialItems: WatchlistFetchState[] = watchlist.map(
        (careersUrl) => {
          try {
            return {
              status: "loading",
              careersUrl,
              cxsJobsUrl: workdayUrlToCxsJobsUrl(careersUrl),
            };
          } catch (error) {
            return {
              status: "error",
              careersUrl,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      );

      setItems(initialItems);

      await Promise.all(
        initialItems.map(async (item) => {
          if (item.status === "error") return;

          try {
            const response = await getJobsFromCxs({
              cxsJobsUrl: item.cxsJobsUrl,
              careersUrl: item.careersUrl,
              maxJobs: 40,
            });

            if (cancelled) return;

            setItems((currentItems) =>
              currentItems.map((currentItem) =>
                currentItem.careersUrl === item.careersUrl
                  ? {
                      status: "success",
                      careersUrl: item.careersUrl,
                      cxsJobsUrl: item.cxsJobsUrl,
                      response,
                    }
                  : currentItem,
              ),
            );
          } catch (error) {
            if (cancelled) return;

            setItems((currentItems) =>
              currentItems.map((currentItem) =>
                currentItem.careersUrl === item.careersUrl
                  ? {
                      status: "error",
                      careersUrl: item.careersUrl,
                      cxsJobsUrl: item.cxsJobsUrl,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  : currentItem,
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
  }, [watchlist]);

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
