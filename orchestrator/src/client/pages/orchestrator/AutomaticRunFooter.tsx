import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AutomaticPresetSelection, WorkplaceType } from "./automatic-run";

interface AutomaticRunFooterProps {
  searchTerms: string[];
  locationCount: number | null;
  locationSummary: string;
  workplaceTypes: WorkplaceType[];
  scoringInstructions: string;
  selectedPreset: AutomaticPresetSelection;
  jobBoardCount: number;
  isSaving: boolean;
  disabled: boolean;
  onRunSearch: () => void;
}

export function AutomaticRunFooter({
  searchTerms,
  locationCount,
  locationSummary,
  workplaceTypes,
  scoringInstructions,
  selectedPreset,
  jobBoardCount,
  isSaving,
  disabled,
  onRunSearch,
}: AutomaticRunFooterProps) {
  const presetLabel =
    selectedPreset.charAt(0).toUpperCase() + selectedPreset.slice(1);
  return (
    <Card className="h-fit">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Your search</CardTitle>
          <Badge variant={disabled ? "outline" : "secondary"}>
            {disabled ? "Review" : "Ready"}
          </Badge>
        </div>
        <CardDescription>
          A plain-English preview of what Job Ops will do.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        <SummaryRow
          label="Roles"
          value={searchTerms.length > 0 ? searchTerms.join(", ") : "Add a role"}
        />
        <Separator />
        <SummaryRow label="Location" value={locationSummary} />
        <Separator />
        <SummaryRow
          label="Arrangement"
          value={workplaceTypes.map(formatWorkplaceType).join(", ")}
        />
        <Separator />
        <SummaryRow
          label="Ranking"
          value={scoringInstructions || "No extra ranking instructions"}
          muted={!scoringInstructions}
        />
        <Separator />
        <SummaryRow
          label="Coverage"
          value={`${presetLabel} · ${jobBoardCount} source${jobBoardCount === 1 ? "" : "s"}`}
        />
        <p
          data-testid="search-count-summary"
          className="mt-2 text-sm text-muted-foreground"
        >
          <strong className="font-semibold tabular-nums text-foreground">
            {searchTerms.length}
          </strong>{" "}
          {searchTerms.length === 1 ? "role" : "roles"} ·{" "}
          <strong className="font-semibold tabular-nums text-foreground">
            {locationCount ?? "…"}
          </strong>{" "}
          {locationCount === 1 ? "location" : "locations"} ·{" "}
          <strong className="font-semibold tabular-nums text-foreground">
            {jobBoardCount}
          </strong>{" "}
          {jobBoardCount === 1 ? "job board" : "job boards"}
        </p>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button type="button" disabled={disabled} onClick={onRunSearch}>
          {isSaving ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Sparkles data-icon="inline-start" />
          )}
          Run search
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You can leave this page after the run starts.
        </p>
      </CardFooter>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-sm", muted && "text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}

function formatWorkplaceType(value: WorkplaceType): string {
  if (value === "onsite") return "On-site";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
