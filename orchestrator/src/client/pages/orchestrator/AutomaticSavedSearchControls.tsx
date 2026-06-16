import type { PipelineSearchPreset } from "@shared/types";
import { BookmarkPlus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
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
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 md:grid-cols-[120px_1fr] md:items-center">
          <Label className="text-base font-semibold">Saved searches</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                {savedSearches.map((search) => (
                  <SelectItem key={search.id} value={search.id}>
                    {search.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex shrink-0 flex-wrap gap-2">
              {canCreate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => onOpenSaveDialog("create")}
                >
                  <BookmarkPlus className="h-4 w-4" />
                  Save as
                </Button>
              ) : null}
              {canUpdate && selectedSavedSearch ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => onOpenSaveDialog("update")}
                >
                  <Save className="h-4 w-4" />
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
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
