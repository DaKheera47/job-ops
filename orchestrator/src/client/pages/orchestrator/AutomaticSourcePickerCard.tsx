import type { JobSource, WatchlistSelectedSource } from "@shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { sourceLabel } from "@/lib/utils";

export interface AutomaticSourcePickerRow {
  source: JobSource;
  selected: boolean;
  status: { badgeLabel: string; detail: string; available: boolean };
}

interface AutomaticSourcePickerCardProps {
  sourceRows: AutomaticSourcePickerRow[];
  selectedSourceRows: AutomaticSourcePickerRow[];
  unavailableSourceRows: AutomaticSourcePickerRow[];
  watchlistSources: WatchlistSelectedSource[];
  selectedWatchlistSourceIds: string[];
  isWatchlistSourcesLoading: boolean;
  onSourceToggle: (source: JobSource, checked: boolean) => void;
  onWatchlistSourceToggle?: (sourceId: string, checked: boolean) => void;
}

export function AutomaticSourcePickerCard({
  sourceRows,
  selectedSourceRows,
  unavailableSourceRows,
  watchlistSources,
  selectedWatchlistSourceIds,
  isWatchlistSourcesLoading,
  onSourceToggle,
  onWatchlistSourceToggle,
}: AutomaticSourcePickerCardProps) {
  const count = selectedSourceRows.length + selectedWatchlistSourceIds.length;
  const labels = [
    ...selectedSourceRows.map((row) => sourceLabel[row.source]),
    ...watchlistSources
      .filter((source) => selectedWatchlistSourceIds.includes(source.id))
      .map((source) => source.label),
  ];
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-lg border px-4 sm:px-5"
    >
      <AccordionItem value="sources" className="border-b-0">
        <AccordionTrigger
          aria-label="Review and edit sources"
          className="gap-4 py-4 hover:no-underline"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span className="text-sm font-medium">
              Sources{" "}
              <span className="font-normal text-muted-foreground">
                · {count} selected
              </span>
            </span>
            <span className="line-clamp-2 text-sm font-normal text-muted-foreground">
              {labels.join(", ") || "Choose where to search"}
            </span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Edit
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {sourceRows
              .filter((row) => row.status.available)
              .map((row) => (
                <label
                  key={row.source}
                  htmlFor={`search-source-${row.source}`}
                  className="flex cursor-pointer items-center gap-3 py-1 text-sm"
                >
                  <Checkbox
                    id={`search-source-${row.source}`}
                    aria-label={sourceLabel[row.source]}
                    checked={row.selected}
                    onCheckedChange={(checked) =>
                      onSourceToggle(row.source, checked === true)
                    }
                  />
                  {sourceLabel[row.source]}
                </label>
              ))}
          </div>
          {isWatchlistSourcesLoading ? (
            <p className="text-xs text-muted-foreground">
              Loading company sources…
            </p>
          ) : watchlistSources.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Company watchlist
              </p>
              {watchlistSources.map((source) => (
                <label
                  key={source.id}
                  htmlFor={`search-watchlist-${source.id}`}
                  className="flex cursor-pointer items-center gap-3 text-sm"
                >
                  <Checkbox
                    id={`search-watchlist-${source.id}`}
                    aria-label={source.label}
                    checked={selectedWatchlistSourceIds.includes(source.id)}
                    disabled={!onWatchlistSourceToggle}
                    onCheckedChange={(checked) =>
                      onWatchlistSourceToggle?.(source.id, checked === true)
                    }
                  />
                  <span className="min-w-0 break-words">{source.label}</span>
                </label>
              ))}
            </div>
          ) : null}
          {unavailableSourceRows.length > 0 ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="unavailable" className="border-b-0">
                <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                  Unavailable sources ({unavailableSourceRows.length})
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {unavailableSourceRows.map((row) => (
                    <div
                      key={row.source}
                      className="text-xs text-muted-foreground"
                    >
                      <p className="font-medium">{sourceLabel[row.source]}</p>
                      <p className="mt-1">{row.status.detail}</p>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
          <a
            href="/watchlist"
            className="inline-block text-xs text-muted-foreground underline underline-offset-4"
          >
            Manage company watchlist
          </a>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
