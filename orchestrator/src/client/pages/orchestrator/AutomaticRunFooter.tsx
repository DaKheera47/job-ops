import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AutomaticRunFooterProps {
  searchTerms: string[];
  locationCount: number | null;
  jobBoardCount: number;
  isSaving: boolean;
  disabled: boolean;
  validationMessage: string | null;
  onRunSearch: () => void;
}

export function AutomaticRunFooter({
  searchTerms,
  locationCount,
  jobBoardCount,
  isSaving,
  disabled,
  validationMessage,
  onRunSearch,
}: AutomaticRunFooterProps) {
  return (
    <footer className="sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-4 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p
            data-testid="search-count-summary"
            className="text-sm text-muted-foreground"
          >
            {searchTerms.length} {searchTerms.length === 1 ? "role" : "roles"} ·{" "}
            {locationCount ?? "…"}{" "}
            {locationCount === 1 ? "location" : "locations"} · {jobBoardCount}{" "}
            {jobBoardCount === 1 ? "job board" : "job boards"}
          </p>
          <output
            id="search-run-status"
            className="block text-xs text-muted-foreground"
          >
            {validationMessage ||
              "You can leave this page once the search starts."}
          </output>
        </div>
        <Button
          type="button"
          className="h-11 shrink-0"
          disabled={disabled}
          aria-describedby="search-run-status"
          onClick={onRunSearch}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {isSaving ? "Starting search…" : "Start search"}
        </Button>
      </div>
    </footer>
  );
}
