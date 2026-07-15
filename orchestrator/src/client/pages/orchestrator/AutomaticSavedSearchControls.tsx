import type { PipelineSearchPreset } from "@shared/types";
import { BookmarkPlus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AutomaticSavedSearchControlsProps {
  savedSearches: PipelineSearchPreset[];
  selectedSavedSearch: PipelineSearchPreset | null;
  selectedSavedSearchId: string | null;
  isLoading: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onApplySavedSearch: (preset: PipelineSearchPreset) => void;
  onOpenSaveDialog: (mode: "create" | "update") => void;
  onDeleteSelectedSearch: () => void;
}

export function AutomaticSavedSearchControls({
  savedSearches,
  selectedSavedSearch,
  selectedSavedSearchId,
  isLoading,
  canCreate,
  canUpdate,
  canDelete,
  onApplySavedSearch,
  onOpenSaveDialog,
  onDeleteSelectedSearch,
}: AutomaticSavedSearchControlsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label className="sr-only">Saved searches</Label>
      <div className="min-w-48 flex-1">
        <Select
          value={selectedSavedSearchId ?? ""}
          onValueChange={(id) => {
            const preset = savedSearches.find((search) => search.id === id);
            if (preset) onApplySavedSearch(preset);
          }}
          disabled={savedSearches.length === 0}
        >
          <SelectTrigger
            aria-label="Saved searches"
            className="h-9 min-w-0 flex-1"
          >
            <SelectValue
              placeholder={isLoading ? "Loading..." : "Select saved search"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {savedSearches.map((search) => (
                <SelectItem key={search.id} value={search.id}>
                  {search.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {canCreate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenSaveDialog("create")}
          >
            <BookmarkPlus data-icon="inline-start" />
            Save as
          </Button>
        ) : null}
        {canUpdate && selectedSavedSearch ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenSaveDialog("update")}
          >
            <Save data-icon="inline-start" />
            Update
          </Button>
        ) : null}
        {canDelete && selectedSavedSearch ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Delete saved search"
            title="Delete saved search"
            onClick={onDeleteSelectedSearch}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
