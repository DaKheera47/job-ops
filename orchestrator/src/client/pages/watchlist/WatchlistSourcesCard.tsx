import * as api from "@client/api";
import { StatusIndicator } from "@client/components/StatusIndicator";
import type {
  WatchlistSource,
  WatchlistSourceTypeDescriptor,
} from "@shared/types.js";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { cn } from "@/lib/utils";
import type { WatchlistSourceDraftCardProps } from "./types";
import {
  CUSTOM_SOURCE_VALUE,
  getNormalizedWatchlistCareersUrl,
  getWatchlistPreviewLabel,
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

function getCustomSourceValue(sourceType: string): string {
  return `${CUSTOM_SOURCE_VALUE}:${sourceType}`;
}

function getSourceDropdownOptions(
  catalogSources: WatchlistSource[],
  sourceTypes: WatchlistSourceTypeDescriptor[],
) {
  return [
    ...catalogSources.map((source) => ({
      value: source.id,
      label: source.label,
      searchText: `${source.label} ${source.careersUrl}`.trim(),
    })),
    ...sourceTypes
      .filter((sourceType) => sourceType.supportsCustomSource)
      .map((sourceType) => ({
        value: getCustomSourceValue(sourceType.sourceType),
        label: sourceType.customSourceOptionLabel,
        searchText: sourceType.customSourceSearchText,
      })),
  ];
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
  sourceTypes,
  formattedLastCheckedAt,
  formattedPreviousLastCheckedAt,
  newJobsCount,
  hasUnsavedChanges,
  isSaving,
  onAddSource,
  onRemoveSource,
  onUpdateDraft,
  onSourceMethodSelected,
  onSourceSearchNoResults,
  onSave,
}: WatchlistSourceDraftCardProps) {
  const [logoDataUrls, setLogoDataUrls] = useState<
    Record<string, string | null>
  >({});
  const sourceDropdownOptions = useMemo(
    () => getSourceDropdownOptions(catalogSources, sourceTypes),
    [catalogSources, sourceTypes],
  );
  const sourceTypeById = useMemo(
    () =>
      new Map(
        sourceTypes.map((sourceType) => [sourceType.sourceType, sourceType]),
      ),
    [sourceTypes],
  );
  const defaultSourceType = sourceTypes[0]?.sourceType ?? "workday";
  const logoCareersUrls = useMemo(() => {
    const urls = new Map<string, { sourceType: string; careersUrl: string }>();

    for (const draft of sourceDrafts) {
      const selectedSource = getSourceDraftDetails(
        draft.catalogSourceId,
        catalogSources,
      );
      const careersUrl = draft.isCustom
        ? getNormalizedWatchlistCareersUrl(
            draft.sourceType,
            draft.customUrl.trim(),
          )
        : (selectedSource?.careersUrl ?? "").trim();

      if (!careersUrl) continue;
      urls.set(careersUrl, {
        sourceType: draft.isCustom
          ? draft.sourceType
          : (selectedSource?.sourceType ?? defaultSourceType),
        careersUrl,
      });
    }

    return [...urls.values()];
  }, [catalogSources, defaultSourceType, sourceDrafts]);

  useEffect(() => {
    const pendingUrls = logoCareersUrls.filter(
      (item) => logoDataUrls[item.careersUrl] === undefined,
    );
    if (pendingUrls.length === 0) return;

    let cancelled = false;

    void Promise.all(
      pendingUrls.map(async (item) => {
        try {
          const response = await api.fetchWatchlistSourceBranding({
            sourceType: item.sourceType,
            careersUrl: item.careersUrl,
          });
          return [item.careersUrl, response.imageDataUrl] as const;
        } catch {
          return [item.careersUrl, null] as const;
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
      className="w-full rounded-lg border border-border bg-card"
    >
      <AccordionItem value="watched-sources">
        <div className="relative">
          <AccordionTrigger className="cursor-pointer items-center justify-between gap-2 px-3 py-3 text-left hover:no-underline">
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-foreground/90">
                  Watched sources
                </h2>
                <Badge variant="secondary">{sourceDrafts.length}</Badge>
              </div>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground/70">
                Pick the company boards you want to monitor manually or add your
                own supported careers URL.
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

          {/* right controls */}
          <div className="flex flex-wrap justify-end gap-2 px-3 pb-2 sm:absolute sm:right-12 sm:top-1/2 sm:border-b-0 sm:bg-transparent sm:p-0 sm:-translate-y-1/2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={sourceDrafts.length >= MAX_WATCHLIST_SOURCES}
              onClick={(e) => {
                e.preventDefault();
                onAddSource();
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add source
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hasUnsavedChanges ? "default" : "secondary"}
              disabled={isSaving || !hasUnsavedChanges}
              onClick={(e) => {
                e.preventDefault();
                onSave();
              }}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save sources
            </Button>
          </div>
        </div>

        <AccordionContent>
          <div className="overflow-y-auto px-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sourceDrafts.map((draft, index) => {
                const selectedSource = getSourceDraftDetails(
                  draft.catalogSourceId,
                  catalogSources,
                );
                const sourceStatus =
                  sourceStatusByDraftId[draft.id] ?? "unsaved";
                const statusCopy = getWatchlistStatusCopy(sourceStatus);
                const dropdownInputId = `watchlist-source-${draft.id}`;
                const descriptor =
                  sourceTypeById.get(draft.sourceType) ??
                  sourceTypes[0] ??
                  null;
                const normalizedCustomUrl = draft.isCustom
                  ? getNormalizedWatchlistCareersUrl(
                      draft.sourceType,
                      draft.customUrl,
                    )
                  : "";
                const matchingCatalogSource = draft.isCustom
                  ? catalogSources.find(
                      (source) =>
                        source.sourceType === draft.sourceType &&
                        source.careersUrl === normalizedCustomUrl,
                    )
                  : null;
                const label = draft.isCustom
                  ? draft.customUrl.trim()
                    ? (matchingCatalogSource?.label ??
                      getWatchlistPreviewLabel(
                        draft.sourceType,
                        draft.customUrl,
                      ))
                    : (descriptor?.customSourceInputLabel ?? "Custom source")
                  : (selectedSource?.label ?? `New Source`);
                const careersUrl = draft.isCustom
                  ? normalizedCustomUrl
                  : (selectedSource?.careersUrl ?? "");
                const isEmpty = !careersUrl.trim();
                const showEditor =
                  isEmpty || (draft.isCustom && sourceStatus === "unsaved");
                const companyLogoUrl = logoDataUrls[careersUrl.trim()] ?? null;

                return (
                  <article
                    key={draft.id}
                    className={cn(
                      "group relative min-w-0 w-full rounded-2xl border border-border/70 bg-card p-4 h-full",
                      showEditor
                        ? "flex flex-col items-stretch gap-4"
                        : "flex items-center gap-4",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-start gap-2",
                        showEditor ? "flex-1" : "",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {companyLogoUrl && (
                          <div className="flex h-16 w-16 p-2">
                            <img
                              src={companyLogoUrl ?? undefined}
                              alt={label}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        )}

                        <div className="min-w-0">
                          {isEmpty ? null : (
                            <h3 className="truncate text-sm font-medium text-foreground">
                              {label}
                            </h3>
                          )}

                          {isEmpty ? null : (
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {draft.isCustom
                                  ? (descriptor?.label ?? draft.sourceType)
                                  : (descriptor?.label ??
                                    selectedSource?.sourceType)}
                              </span>
                              <StatusIndicator
                                label={statusCopy.label}
                                variant={statusCopy.variant}
                                tooltip={statusCopy.tooltip}
                                tooltipClassName="max-w-64 text-xs leading-relaxed"
                              />
                            </div>
                          )}

                          {careersUrl && (
                            <a
                              href={careersUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "link", size: "sm" }),
                                "px-0 text-xs",
                              )}
                            >
                              View website
                            </a>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:outline-none transition-opacity"
                        aria-label={`Remove watchlist source ${index + 1}`}
                        onClick={() => onRemoveSource(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {showEditor && (
                      <div className="w-full space-y-2 pt-1">
                        <SearchableDropdown
                          inputId={dropdownInputId}
                          value={
                            draft.isCustom
                              ? getCustomSourceValue(draft.sourceType)
                              : (draft.catalogSourceId ?? "")
                          }
                          options={sourceDropdownOptions}
                          onValueChange={(value) => {
                            if (value.startsWith(`${CUSTOM_SOURCE_VALUE}:`)) {
                              const sourceType =
                                value.slice(CUSTOM_SOURCE_VALUE.length + 1) ||
                                defaultSourceType;
                              onSourceMethodSelected({
                                method: "custom_url",
                                sourceType,
                              });
                              onUpdateDraft(index, (current) => ({
                                ...current,
                                isCustom: true,
                                sourceType,
                                catalogSourceId: null,
                              }));
                              return;
                            }

                            const selectedCatalogSource = catalogSources.find(
                              (source) => source.id === value,
                            );
                            onSourceMethodSelected({
                              method: "catalog",
                              catalogSourceId: value,
                              sourceType: selectedCatalogSource?.sourceType,
                              careersUrl:
                                selectedCatalogSource?.careersUrl ?? undefined,
                            });
                            onUpdateDraft(index, (current) => ({
                              ...current,
                              isCustom: false,
                              sourceType:
                                selectedCatalogSource?.sourceType ??
                                current.sourceType,
                              catalogSourceId: value,
                            }));
                          }}
                          placeholder="Choose company"
                          searchPlaceholder="Search companies..."
                          emptyText={
                            descriptor?.emptyCatalogText ??
                            "No companies found."
                          }
                          ariaLabel={`Watchlist source ${index + 1}`}
                          allowCustomValue={false}
                          onEmptyResults={(searchText) =>
                            onSourceSearchNoResults({ searchText })
                          }
                          triggerClassName="h-9 w-full justify-between rounded-xl border-border/70 bg-background/70"
                          contentClassName="w-[var(--radix-popover-trigger-width)] min-w-[320px]"
                        />
                        {draft.isCustom ? (
                          <Input
                            value={draft.customUrl}
                            onChange={(event) =>
                              onUpdateDraft(index, (current) => ({
                                ...current,
                                customUrl: event.target.value,
                              }))
                            }
                            placeholder={
                              descriptor?.customSourcePlaceholder ??
                              "https://..."
                            }
                            aria-label={`${descriptor?.customSourceInputLabel ?? "Custom source URL"} ${index + 1}`}
                            className="rounded-xl"
                          />
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
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
