import { fetchWorkdayLogo } from "@client/api/workday";
import { StatusIndicator } from "@client/components/StatusIndicator";
import type { WatchlistSource } from "@shared/types.js";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { WatchlistSourceDraftCardProps } from "./types";
import {
  CUSTOM_SOURCE_VALUE,
  getEmployerFromCareersUrl,
  getSourceHost,
  WATCHLIST_SOURCE_COUNT_OPTIONS,
} from "./utils";

const MAX_WATCHLIST_SOURCES =
  WATCHLIST_SOURCE_COUNT_OPTIONS[WATCHLIST_SOURCE_COUNT_OPTIONS.length - 1] ??
  5;

function getSourceDraftDetails(
  draftCatalogSourceId: string | null,
  catalogSources: WatchlistSource[],
) {
  return catalogSources.find((source) => source.id === draftCatalogSourceId);
}

function getCompanyInitials(label: string): string {
  const parts = label
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "WD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatCustomSourceLabel(careersUrl: string): string {
  const employer = getEmployerFromCareersUrl(careersUrl).trim();
  if (!employer) return "Custom Workday URL";
  return employer.length <= 3 ? employer.toUpperCase() : employer;
}

function getWatchlistStatusCopy(status: "watching" | "unsaved"): {
  label: string;
  variant: "emerald" | "amber";
  tooltip: string;
} {
  if (status === "watching") {
    return {
      label: "Watching",
      variant: "emerald",
      tooltip:
        "This source matches your saved watchlist settings and is currently being monitored.",
    };
  }

  return {
    label: "Unsaved",
    variant: "amber",
    tooltip:
      "This source has local changes that have not been saved yet, so watchlist monitoring is not using this version.",
  };
}

export function WatchlistSourcesCard({
  sourceDrafts,
  sourceStatusByDraftId,
  catalogSources,
  formattedLastCheckedAt,
  formattedPreviousLastCheckedAt,
  newJobsCount,
  isSaving,
  onAddSource,
  onRemoveSource,
  onUpdateDraft,
  onSave,
}: WatchlistSourceDraftCardProps) {
  const [logoDataUrls, setLogoDataUrls] = useState<
    Record<string, string | null>
  >({});
  const logoCareersUrls = useMemo(() => {
    const urls = new Set<string>();

    for (const draft of sourceDrafts) {
      const selectedSource = getSourceDraftDetails(
        draft.catalogSourceId,
        catalogSources,
      );
      const careersUrl = draft.isCustom
        ? draft.customUrl.trim()
        : (selectedSource?.careersUrl ?? "").trim();

      if (!careersUrl) continue;
      urls.add(careersUrl);
    }

    return [...urls];
  }, [catalogSources, sourceDrafts]);

  useEffect(() => {
    const pendingUrls = logoCareersUrls.filter(
      (careersUrl) => logoDataUrls[careersUrl] === undefined,
    );
    if (pendingUrls.length === 0) return;

    let cancelled = false;

    void Promise.all(
      pendingUrls.map(async (careersUrl) => {
        try {
          const response = await fetchWorkdayLogo(careersUrl);
          return [careersUrl, response.imageDataUrl] as const;
        } catch {
          return [careersUrl, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;

      setLogoDataUrls((current) => {
        const next = { ...current };
        for (const [careersUrl, imageDataUrl] of entries) {
          next[careersUrl] = imageDataUrl;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [logoCareersUrls, logoDataUrls]);

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="watched-sources"
      className="overflow-hidden rounded-lg border border-border/45 bg-muted/25"
    >
      <AccordionItem value="watched-sources" className="border-b-0">
        <div className="relative">
          <AccordionTrigger className="cursor-pointer items-start justify-between gap-2 border-b border-border/35 bg-muted/5 px-3 py-3 pr-4 text-left hover:bg-muted/40 hover:no-underline">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-foreground/90">
                  Watched sources
                </h2>
                <Badge
                  variant="secondary"
                  className="rounded-full bg-foreground/8 px-2 py-0 text-[11px] font-medium text-foreground/80"
                >
                  {sourceDrafts.length}
                </Badge>
              </div>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground/70">
                Pick the company boards you want to monitor or add your own
                Workday URL.
              </p>
              {formattedLastCheckedAt ? (
                <p className="mt-2 text-xs text-muted-foreground/70">
                  Last checked {formattedLastCheckedAt}
                  {formattedPreviousLastCheckedAt
                    ? ` · ${newJobsCount} new since ${formattedPreviousLastCheckedAt}`
                    : " · First check saved your baseline"}
                </p>
              ) : null}
            </div>
          </AccordionTrigger>
          <div className="flex flex-wrap justify-end gap-1 border-b border-border/35 bg-muted/5 px-3 pb-2 sm:absolute sm:right-8 sm:top-1/2 sm:border-b-0 sm:bg-transparent sm:p-0 sm:-translate-y-1/2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={sourceDrafts.length >= MAX_WATCHLIST_SOURCES}
              onClick={onAddSource}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add source
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isSaving}
              onClick={onSave}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save sources
            </Button>
          </div>
        </div>

        <AccordionContent className="p-0">
          <div className="bg-background/20 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sourceDrafts.map((draft, index) => {
                const selectedSource = getSourceDraftDetails(
                  draft.catalogSourceId,
                  catalogSources,
                );
                const sourceStatus =
                  sourceStatusByDraftId[draft.id] ?? "unsaved";
                const statusCopy = getWatchlistStatusCopy(sourceStatus);
                const label = draft.isCustom
                  ? draft.customUrl.trim()
                    ? formatCustomSourceLabel(draft.customUrl.trim())
                    : "Custom Workday URL"
                  : (selectedSource?.label ?? `Source ${index + 1}`);
                const careersUrl = draft.isCustom
                  ? draft.customUrl
                  : (selectedSource?.careersUrl ?? "");
                const host = getSourceHost(careersUrl);
                const isEmpty = Boolean(draft.catalogSourceId);
                const companyLogoUrl = logoDataUrls[careersUrl.trim()] ?? null;

                return (
                  <article
                    key={draft.id}
                    className={cn(
                      "group min-w-0 rounded-2xl border px-3 pb-4 pt-3 transition-colors md:min-h-56",
                      isEmpty
                        ? "border-border/70 bg-background/80 shadow-sm"
                        : "border-dashed border-border/70 bg-background/45",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-16 w-16 p-2">
                          {companyLogoUrl || isEmpty ? (
                            <img
                              src={companyLogoUrl ?? undefined}
                              alt={label}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-lg">
                              {getCompanyInitials(label)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {label}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{draft.isCustom ? "Custom" : "Workday"}</span>
                            <StatusIndicator
                              label={statusCopy.label}
                              variant={statusCopy.variant}
                              tooltip={statusCopy.tooltip}
                              tooltipClassName="max-w-64 text-xs leading-relaxed"
                            />
                          </div>
                          <p className="mt-2 truncate text-xs text-muted-foreground">
                            {careersUrl ||
                              "Choose a company board to start watching."}
                          </p>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {draft.isCustom
                              ? (host ?? "Paste a Workday careers URL")
                              : selectedSource
                                ? `${selectedSource.sourceType} source`
                                : "Catalog source"}
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground"
                        aria-label={`Remove watchlist source ${index + 1}`}
                        onClick={() => onRemoveSource(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      <Select
                        value={
                          draft.isCustom
                            ? CUSTOM_SOURCE_VALUE
                            : (draft.catalogSourceId ?? undefined)
                        }
                        onValueChange={(value) => {
                          if (value === CUSTOM_SOURCE_VALUE) {
                            onUpdateDraft(index, (current) => ({
                              ...current,
                              isCustom: true,
                              catalogSourceId: null,
                            }));
                            return;
                          }

                          onUpdateDraft(index, (current) => ({
                            ...current,
                            isCustom: false,
                            catalogSourceId: value,
                          }));
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Watchlist source ${index + 1}`}
                          className="h-9 rounded-xl border-border/70 bg-background/70"
                        >
                          <SelectValue placeholder="Select a source" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogSources.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              {source.label}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_SOURCE_VALUE}>
                            Choose your own Workday URL
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {draft.isCustom ? (
                        <Input
                          value={draft.customUrl}
                          onChange={(event) =>
                            onUpdateDraft(index, (current) => ({
                              ...current,
                              customUrl: event.target.value,
                            }))
                          }
                          placeholder="https://company.wd1.myworkdayjobs.com/..."
                          aria-label={`Custom Workday URL ${index + 1}`}
                          className="rounded-xl"
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {sourceDrafts.length < MAX_WATCHLIST_SOURCES ? (
                <button
                  type="button"
                  className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/30 p-5 text-center transition-colors hover:border-border hover:bg-background/50"
                  onClick={onAddSource}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-foreground">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="mt-4 text-sm font-semibold text-foreground">
                    Add source
                  </span>
                  <span className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                    Paste a Workday board URL or choose another company from the
                    catalog.
                  </span>
                </button>
              ) : null}
            </div>
            {sourceDrafts.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                No watchlist sources selected yet.
              </div>
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
