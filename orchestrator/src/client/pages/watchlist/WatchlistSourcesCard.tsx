import { fetchWorkdayLogo } from "@client/api/workday";
import type { WatchlistSource } from "@shared/types.js";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export function WatchlistSourcesCard({
  sourceDrafts,
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
    <section className="rounded-2xl border border-border/60 bg-[linear-gradient(180deg,hsl(var(--card))_0%,color-mix(in_oklab,hsl(var(--card))_88%,hsl(var(--background)))_100%)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Watched sources
            </h2>
            <Badge
              variant="secondary"
              className="rounded-full bg-foreground/8 px-2 py-0 text-[11px] font-medium text-foreground/80"
            >
              {sourceDrafts.length}
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pick the company boards you want to monitor or add your own Workday
            URL.
          </p>
          {formattedLastCheckedAt ? (
            <p className="text-xs text-muted-foreground">
              Last checked {formattedLastCheckedAt}
              {formattedPreviousLastCheckedAt
                ? ` · ${newJobsCount} new since ${formattedPreviousLastCheckedAt}`
                : " · First check saved your baseline"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={sourceDrafts.length >= MAX_WATCHLIST_SOURCES}
            onClick={onAddSource}
          >
            <Plus className="h-4 w-4" />
            Add source
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-xl"
            disabled={isSaving}
            onClick={onSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save sources
          </Button>
        </div>
      </div>{" "}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sourceDrafts.map((draft, index) => {
          const selectedSource = getSourceDraftDetails(
            draft.catalogSourceId,
            catalogSources,
          );
          const label = draft.isCustom
            ? draft.customUrl.trim() || "Custom Workday URL"
            : (selectedSource?.label ?? `Source ${index + 1}`);
          const careersUrl = draft.isCustom
            ? draft.customUrl
            : (selectedSource?.careersUrl ?? "");
          const host = getSourceHost(careersUrl);
          const isSelected = draft.isCustom || Boolean(draft.catalogSourceId);
          const companyLogoUrl = logoDataUrls[careersUrl.trim()] ?? null;

          return (
            <article
              key={draft.id}
              className={cn(
                "group rounded-2xl border p-3 transition-colors",
                isSelected
                  ? "border-border/70 bg-background/80 shadow-sm"
                  : "border-dashed border-border/70 bg-background/45",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 bg-white shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,color-mix(in_oklab,hsl(var(--primary))_72%,black),color-mix(in_oklab,hsl(var(--primary))_42%,hsl(var(--muted))))] text-sm font-semibold text-primary-foreground shadow-inner">
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt={label}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-lg">{getCompanyInitials(label)}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {label}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{draft.isCustom ? "Custom" : "Workday"}</span>
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        />
                        <span>Active</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-muted-foreground"
                      aria-label={`Remove watchlist source ${index + 1}`}
                      onClick={() => onRemoveSource(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {careersUrl || "Choose a company board to start watching."}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {draft.isCustom
                      ? (host ?? "Paste a Workday careers URL")
                      : selectedSource
                        ? `${selectedSource.sourceType} source`
                        : "Catalog source"}
                  </p>
                </div>
              </div>{" "}
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
    </section>
  );
}
