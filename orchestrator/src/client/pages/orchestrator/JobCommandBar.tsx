import { useHotkeys } from "@client/hooks/useHotkeys";
import type { JobListItem } from "@shared/types.js";
import type React from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { bucketQueryLength, trackProductEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { FilterTab } from "./constants";
import {
  buildCommandBarRows,
  type CommandBarRow,
  extractLeadingAtToken,
  getFilterTab,
  getLockMatchesFromAliasPrefix,
  groupJobsForCommandBar,
  jobMatchesLock,
  lockLabel,
  orderCommandGroups,
  resolveLockFromAliasPrefix,
  type StatusLock,
  stripLeadingAtToken,
} from "./JobCommandBar.utils";
import { JobCommandBarLockBadge } from "./JobCommandBarLockBadge";
import { JobRowContent } from "./JobRowContent";
import { useVirtualizedList } from "./virtualizedList";

interface JobCommandBarProps {
  jobs: JobListItem[];
  onSelectJob: (tab: FilterTab, jobId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  enabled?: boolean;
}

const ROW_HEIGHT_ESTIMATES: Record<CommandBarRow["kind"], number> = {
  groupHeading: 28,
  separator: 1,
  option: 72,
};

const LOCK_ROW_HEIGHT_ESTIMATE = 56;
const RESULTS_LIST_ID = "job-command-bar-results";

const lockDialogAccentClass: Record<StatusLock, string> = {
  ready:
    "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_0_36px_-12px_rgba(16,185,129,0.55)]",
  discovered:
    "border-sky-500/50 shadow-[0_0_0_1px_rgba(14,165,233,0.2),0_0_36px_-12px_rgba(14,165,233,0.55)]",
  applied:
    "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_0_36px_-12px_rgba(16,185,129,0.55)]",
  in_progress:
    "border-cyan-500/50 shadow-[0_0_0_1px_rgba(6,182,212,0.2),0_0_36px_-12px_rgba(6,182,212,0.55)]",
  skipped:
    "border-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.2),0_0_36px_-12px_rgba(244,63,94,0.55)]",
  expired:
    "border-zinc-400/40 shadow-[0_0_0_1px_rgba(161,161,170,0.2),0_0_32px_-12px_rgba(161,161,170,0.45)]",
};

const buildSelectableRows = (rows: CommandBarRow[]) =>
  rows.filter(
    (row): row is Extract<CommandBarRow, { kind: "option" }> =>
      row.kind === "option",
  );

const FALLBACK_OVERSCAN_PX = 240;

const getEstimatedRowHeight = (row: CommandBarRow) => {
  if (row.kind === "option" && row.optionKind === "lockSuggestion") {
    return LOCK_ROW_HEIGHT_ESTIMATE;
  }

  return ROW_HEIGHT_ESTIMATES[row.kind];
};

const buildFallbackVirtualItems = (
  rows: CommandBarRow[],
  scrollTop: number,
  viewportHeight: number,
) => {
  const offsets: number[] = [];
  let runningOffset = 0;

  for (const row of rows) {
    offsets.push(runningOffset);
    runningOffset += getEstimatedRowHeight(row);
  }

  const startThreshold = Math.max(0, scrollTop - FALLBACK_OVERSCAN_PX);
  const endThreshold = scrollTop + viewportHeight + FALLBACK_OVERSCAN_PX;

  let startIndex = 0;
  while (
    startIndex < rows.length &&
    offsets[startIndex] + getEstimatedRowHeight(rows[startIndex]) <
      startThreshold
  ) {
    startIndex += 1;
  }

  let endIndex = startIndex;
  while (endIndex < rows.length && offsets[endIndex] < endThreshold) {
    endIndex += 1;
  }

  return rows.slice(startIndex, endIndex).map((row, localIndex) => ({
    index: startIndex + localIndex,
    start: offsets[startIndex + localIndex] ?? 0,
    row,
  }));
};

export const JobCommandBar: React.FC<JobCommandBarProps> = ({
  jobs,
  onSelectJob,
  open,
  onOpenChange,
  enabled = true,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeLock, setActiveLock] = useState<StatusLock | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const isOpenControlled = typeof open === "boolean";
  const isOpen = isOpenControlled ? open : internalOpen;

  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isOpenControlled) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isOpenControlled, onOpenChange],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setActiveLock(null);
    setActiveRowId(null);
  }, [setDialogOpen]);

  useHotkeys(
    {
      "$mod+k": (event) => {
        event.preventDefault();
        if (isOpen) {
          closeDialog();
          return;
        }
        setDialogOpen(true);
      },
    },
    { enabled },
  );

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = (jobs.length > 250 ? deferredQuery : query)
    .trim()
    .toLowerCase();

  const scopedJobs = useMemo(() => {
    if (!activeLock) return jobs;
    return jobs.filter((job) => jobMatchesLock(job, activeLock));
  }, [activeLock, jobs]);

  const groupedJobs = useMemo(
    () => groupJobsForCommandBar(scopedJobs, normalizedQuery),
    [normalizedQuery, scopedJobs],
  );

  const orderedGroups = useMemo(
    () => orderCommandGroups(groupedJobs, normalizedQuery),
    [groupedJobs, normalizedQuery],
  );

  const lockSuggestions = useMemo(() => {
    if (activeLock) return [];
    const token = extractLeadingAtToken(query);
    if (token === null) return [];
    return getLockMatchesFromAliasPrefix(token);
  }, [activeLock, query]);

  const rows = useMemo(
    () =>
      buildCommandBarRows({
        activeLock,
        groupedJobs,
        lockSuggestions,
        orderedGroups,
      }),
    [activeLock, groupedJobs, lockSuggestions, orderedGroups],
  );

  const selectableRows = useMemo(() => buildSelectableRows(rows), [rows]);
  const selectableRowIds = useMemo(
    () => selectableRows.map((row) => row.id),
    [selectableRows],
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveRowId(null);
      return;
    }

    if (selectableRowIds.length === 0) {
      setActiveRowId(null);
      return;
    }

    setActiveRowId((current) => {
      if (current && selectableRowIds.includes(current)) return current;
      return selectableRowIds[0];
    });
  }, [isOpen, selectableRowIds]);

  const activeRowIndex = useMemo(() => {
    if (!activeRowId) return -1;
    return rows.findIndex((row) => row.id === activeRowId);
  }, [activeRowId, rows]);

  const {
    scrollElementRef,
    virtualItems,
    totalSize,
    measureElement,
    scrollToIndex,
  } = useVirtualizedList({
    count: rows.length,
    enabled: isOpen,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 0;
      if (row.kind === "option" && row.optionKind === "lockSuggestion") {
        return LOCK_ROW_HEIGHT_ESTIMATE;
      }
      return ROW_HEIGHT_ESTIMATES[row.kind];
    },
    getItemKey: (index) => rows[index]?.id ?? `row-${index}`,
    overscan: 8,
    initialRect: {
      height: Math.max(240, Math.round(window.innerHeight * 0.65)),
      width: window.innerWidth,
    },
  });

  const viewportHeight = Math.max(240, Math.round(window.innerHeight * 0.65));

  const estimatedLayout = useMemo(
    () => buildFallbackVirtualItems(rows, scrollTop, viewportHeight),
    [rows, scrollTop, viewportHeight],
  );
  const estimatedTotalSize = useMemo(
    () =>
      rows.reduce(
        (currentTotal, row) => currentTotal + getEstimatedRowHeight(row),
        0,
      ),
    [rows],
  );

  const renderedVirtualItems =
    virtualItems.length > 0 ? virtualItems : estimatedLayout;
  const renderedTotalSize =
    virtualItems.length > 0 ? totalSize : estimatedTotalSize;

  const setResultsScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      resultsScrollRef.current = element;
      scrollElementRef(element);
    },
    [scrollElementRef],
  );

  useEffect(() => {
    if (activeRowIndex < 0) return;
    scrollToIndex(activeRowIndex, { align: "auto" });
    if (virtualItems.length === 0) {
      const nextScrollTop = estimatedLayout.find(
        (item) => item.index === activeRowIndex,
      )?.start;
      if (typeof nextScrollTop === "number") {
        if (resultsScrollRef.current) {
          resultsScrollRef.current.scrollTop = nextScrollTop;
        }
        setScrollTop(nextScrollTop);
      }
    }
  }, [activeRowIndex, estimatedLayout, scrollToIndex, virtualItems.length]);

  const applyLock = useCallback((lock: StatusLock) => {
    setActiveLock(lock);
    setQuery((current) => stripLeadingAtToken(current));
  }, []);

  useEffect(() => {
    if (isOpen) return;
    setActiveLock(null);
  }, [isOpen]);

  const moveActiveSelection = useCallback(
    (direction: 1 | -1) => {
      if (selectableRows.length === 0) return;

      setActiveRowId((current) => {
        const currentIndex = current ? selectableRowIds.indexOf(current) : -1;

        if (currentIndex < 0) {
          return direction > 0
            ? selectableRowIds[0]
            : selectableRowIds[selectableRowIds.length - 1];
        }

        const nextIndex = Math.min(
          selectableRowIds.length - 1,
          Math.max(0, currentIndex + direction),
        );
        return selectableRowIds[nextIndex];
      });
    },
    [selectableRowIds, selectableRows.length],
  );

  const selectRow = useCallback(
    (row: Extract<CommandBarRow, { kind: "option" }>) => {
      if (row.optionKind === "lockSuggestion" && row.lock) {
        applyLock(row.lock);
        return;
      }

      if (!row.job) return;

      trackProductEvent("jobs_command_bar_job_selected", {
        had_status_lock: Boolean(activeLock),
        status_lock: activeLock ?? "none",
        result_group: row.groupId,
        query_length_bucket: bucketQueryLength(
          stripLeadingAtToken(query).trim(),
        ),
      });
      closeDialog();
      onSelectJob(getFilterTab(row.job.status), row.job.id);
    },
    [activeLock, applyLock, closeDialog, onSelectJob, query],
  );

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (event.key === "Tab" || event.key === "Enter") &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const token = extractLeadingAtToken(query);
      if (!token) {
        if (event.key === "Enter" && activeRowId) {
          const selectedRow = rows.find(
            (row): row is Extract<CommandBarRow, { kind: "option" }> =>
              row.kind === "option" && row.id === activeRowId,
          );
          if (selectedRow) {
            event.preventDefault();
            selectRow(selectedRow);
          }
        }
        return;
      }

      const nextLock = resolveLockFromAliasPrefix(token);
      if (!nextLock) return;

      event.preventDefault();
      applyLock(nextLock);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveSelection(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (selectableRowIds.length > 0) {
        setActiveRowId(selectableRowIds[0]);
      }
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (selectableRowIds.length > 0) {
        setActiveRowId(selectableRowIds[selectableRowIds.length - 1]);
      }
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && activeLock) {
      event.preventDefault();
      setActiveLock(null);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDialogOpen(true);
      return;
    }
    closeDialog();
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      onEscapeKeyDown={(event) => {
        if (!activeLock) return;
        event.preventDefault();
        setActiveLock(null);
      }}
      contentClassName={`max-w-4xl transition-[border-color,box-shadow] duration-200 ${activeLock ? lockDialogAccentClass[activeLock] : ""}`}
    >
      <DialogTitle className="sr-only">Job Search</DialogTitle>
      <DialogDescription className="sr-only">
        Search jobs across all states by job title or company name.
      </DialogDescription>
      <CommandInput
        placeholder="Search jobs by job title or company name..."
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleInputKeyDown}
        prefix={
          activeLock ? (
            <JobCommandBarLockBadge activeLock={activeLock} />
          ) : undefined
        }
        aria-controls={RESULTS_LIST_ID}
        aria-activedescendant={activeRowId ?? undefined}
        aria-autocomplete="list"
        role="combobox"
        aria-expanded={isOpen}
      />
      <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">
        Use <span className="font-mono">@</span> + status + Tab/Enter to lock a
        status. Backspace on empty search clears the lock.
      </div>

      {rows.length === 0 ? (
        <output className="block py-6 text-center text-sm" aria-live="polite">
          No jobs found.
        </output>
      ) : (
        <div
          id={RESULTS_LIST_ID}
          ref={setResultsScrollElement}
          data-testid={RESULTS_LIST_ID}
          data-virtual-height={Math.max(
            240,
            Math.round(window.innerHeight * 0.65),
          )}
          className="max-h-[65vh] overflow-y-auto overflow-x-hidden"
          role="listbox"
          aria-label="Job search results"
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
          }}
        >
          <div
            className="relative w-full"
            style={{ height: `${renderedTotalSize}px` }}
          >
            {renderedVirtualItems.map((virtualItem) => {
              const row = rows[virtualItem.index];
              if (!row) return null;

              return (
                <div
                  key={row.id}
                  ref={measureElement}
                  data-index={virtualItem.index}
                  data-virtual-height={
                    row.kind === "option" && row.optionKind === "lockSuggestion"
                      ? LOCK_ROW_HEIGHT_ESTIMATE
                      : ROW_HEIGHT_ESTIMATES[row.kind]
                  }
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {row.kind === "groupHeading" ? (
                    <div
                      cmdk-group-heading=""
                      className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      {row.heading}
                    </div>
                  ) : row.kind === "separator" ? (
                    <hr className="-mx-1 h-px border-0 bg-border" />
                  ) : row.optionKind === "lockSuggestion" && row.lock ? (
                    <div
                      cmdk-item=""
                      role="option"
                      tabIndex={-1}
                      aria-selected={row.id === activeRowId}
                      data-selected={row.id === activeRowId}
                      className={cn(
                        "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                      )}
                      onMouseEnter={() => setActiveRowId(row.id)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectRow(row)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        selectRow(row);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            row.lock === "ready" && "bg-emerald-400",
                            row.lock === "discovered" && "bg-sky-400",
                            row.lock === "applied" && "bg-emerald-400",
                            row.lock === "in_progress" && "bg-cyan-400",
                            row.lock === "skipped" && "bg-rose-400",
                            row.lock === "expired" && "bg-muted-foreground",
                          )}
                        />
                        <span className="truncate text-sm font-medium">
                          Lock to @{lockLabel[row.lock]}
                        </span>
                      </div>
                    </div>
                  ) : row.job ? (
                    <div
                      cmdk-item=""
                      role="option"
                      tabIndex={-1}
                      aria-selected={row.id === activeRowId}
                      data-selected={row.id === activeRowId}
                      className={cn(
                        "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                      )}
                      onMouseEnter={() => setActiveRowId(row.id)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectRow(row)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        selectRow(row);
                      }}
                    >
                      <JobRowContent
                        job={row.job}
                        isSelected={row.id === activeRowId}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CommandDialog>
  );
};
