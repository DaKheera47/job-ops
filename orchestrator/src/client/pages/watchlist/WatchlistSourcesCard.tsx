import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WatchlistSourceDraftCardProps } from "./types";
import { CUSTOM_SOURCE_VALUE, WATCHLIST_SOURCE_COUNT_OPTIONS } from "./utils";

export function WatchlistSourcesCard({
  sourceDrafts,
  catalogSources,
  formattedLastCheckedAt,
  formattedPreviousLastCheckedAt,
  newJobsCount,
  isSaving,
  onSourceCountChange,
  onUpdateDraft,
  onSave,
}: WatchlistSourceDraftCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">
            Watched sources
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose catalog sources or add your own Workday URL.
          </p>
          {formattedLastCheckedAt ? (
            <p className="text-xs text-muted-foreground">
              Last checked: {formattedLastCheckedAt}
              {formattedPreviousLastCheckedAt
                ? ` · ${newJobsCount} new since ${formattedPreviousLastCheckedAt}`
                : " · First check saved your baseline"}
            </p>
          ) : null}
        </div>

        <div className="w-full max-w-[180px]">
          <Select
            value={String(sourceDrafts.length)}
            onValueChange={(value) => onSourceCountChange(Number(value))}
          >
            <SelectTrigger aria-label="Number of watchlist sources">
              <SelectValue placeholder="Source count" />
            </SelectTrigger>
            <SelectContent>
              {WATCHLIST_SOURCE_COUNT_OPTIONS.map((count) => (
                <SelectItem key={`count-${count}`} value={String(count)}>
                  {count} {count === 1 ? "source" : "sources"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {sourceDrafts.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No watchlist sources selected.
          </div>
        ) : null}

        {sourceDrafts.map((draft, index) => (
          <div
            key={draft.id}
            className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Source {index + 1}
              </div>
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
                <SelectTrigger aria-label={`Watchlist source ${index + 1}`}>
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
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Workday URL
              </div>
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
                />
              ) : (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                  {catalogSources.find(
                    (source) => source.id === draft.catalogSourceId,
                  )?.careersUrl ?? "Select a source to preview its URL"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          className="gap-2"
          disabled={isSaving}
          onClick={onSave}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save sources
        </Button>
      </div>
    </div>
  );
}
