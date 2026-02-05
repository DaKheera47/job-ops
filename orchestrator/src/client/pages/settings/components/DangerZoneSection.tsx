import {
  ALL_JOB_STATUSES,
  STATUS_DESCRIPTIONS,
} from "@client/pages/settings/constants";
import type { JobStatus } from "@shared/types";
import { AlertTriangle, Trash2 } from "lucide-react";

import type React from "react";
import { useState } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type DangerZoneSectionProps = {
  statusesToClear: JobStatus[];
  toggleStatusToClear: (status: JobStatus) => void;
  handleClearByStatuses: () => void;
  handleClearDatabase: () => void;
  handleClearByScore?: (threshold: number) => void;
  isLoading: boolean;
  isSaving: boolean;
};

export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({
  statusesToClear,
  toggleStatusToClear,
  handleClearByStatuses,
  handleClearDatabase,
  handleClearByScore,
  isLoading,
  isSaving,
}) => {
  const [scoreThreshold, setScoreThreshold] = useState<string>("");
  const parsedThreshold = parseInt(scoreThreshold, 10);
  const isValidThreshold =
    !Number.isNaN(parsedThreshold) &&
    parsedThreshold >= 0 &&
    parsedThreshold <= 100;
  return (
    <AccordionItem
      value="danger-zone"
      className="border rounded-lg px-4 border-destructive/30 mt-4"
    >
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-base font-semibold tracking-wider">
            Danger Zone
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-md space-y-4">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-destructive">
                Clear Jobs by Status
              </div>
              <div className="text-xs text-muted-foreground">
                Select which job statuses you want to clear.
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_JOB_STATUSES.map((status) => {
                const isSelected = statusesToClear.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatusToClear(status)}
                    disabled={isLoading || isSaving}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected
                        ? "border-destructive bg-destructive/10"
                        : "border-border"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? "border-destructive"
                          : "border-muted-foreground"
                      }`}
                    >
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                      )}
                    </div>
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium capitalize">
                        {status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {STATUS_DESCRIPTIONS[status]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={
                    isLoading || isSaving || statusesToClear.length === 0
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Selected ({statusesToClear.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear jobs by status?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all jobs with the following statuses:{" "}
                    {statusesToClear.join(", ")}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearByStatuses}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear {statusesToClear.length} status
                    {statusesToClear.length !== 1 ? "es" : ""}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Separator />

          {/* Clear Jobs Below Score */}
          {handleClearByScore && (
            <div className="p-3 rounded-md space-y-4">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-destructive">
                  Clear Jobs Below Score
                </div>
                <div className="text-xs text-muted-foreground">
                  Remove all jobs with a suitability score below the specified
                  threshold. Applied jobs will not be deleted.
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="score-threshold"
                    className="text-sm font-medium mb-1.5 block"
                  >
                    Score Threshold (0-100)
                  </label>
                  <Input
                    id="score-threshold"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    placeholder="Enter score threshold"
                    value={scoreThreshold}
                    onChange={(e) => setScoreThreshold(e.target.value)}
                    disabled={isLoading || isSaving}
                    className="w-full"
                  />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="default"
                      disabled={isLoading || isSaving || !isValidThreshold}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear Below {isValidThreshold ? parsedThreshold : "..."}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Clear jobs below score {parsedThreshold}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all jobs with a suitability
                        score below {parsedThreshold}. Applied jobs will be
                        preserved. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          if (isValidThreshold) {
                            handleClearByScore(parsedThreshold);
                            setScoreThreshold("");
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear jobs
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-3 rounded-md">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-destructive">
                Clear Entire Database
              </div>
              <div className="text-xs text-muted-foreground">
                Delete all jobs and pipeline runs from the database.
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isLoading || isSaving}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Database
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all jobs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all jobs and pipeline runs from the database.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearDatabase}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear database
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
