import { EmptyState, ListItem, ListPanel } from "@client/components/layout";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { BackupValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { BackupInfo } from "@shared/types.js";
import { Archive, Clock, Trash2 } from "lucide-react";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type BackupSettingsSectionProps = {
  values: BackupValues;
  backups: BackupInfo[];
  nextScheduled: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onCreateBackup: () => void;
  onDeleteBackup: (filename: string) => void;
  isCreatingBackup: boolean;
  isDeletingBackup: boolean;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatBackupDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
};

export const BackupSettingsSection: React.FC<BackupSettingsSectionProps> = ({
  values,
  backups,
  nextScheduled,
  isLoading,
  isSaving,
  onCreateBackup,
  onDeleteBackup,
  isCreatingBackup,
  isDeletingBackup,
}) => {
  const { backupEnabled, backupHour, backupMaxCount } = values;
  const { control, watch } = useFormContext<UpdateSettingsInput>();

  // Watch the current form value to conditionally show/hide fields
  const currentBackupEnabled = watch("backupEnabled") ?? backupEnabled.default;

  return (
    <AccordionItem value="backup" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Backup</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-6">
          {/* Enable automatic backups toggle */}
          <div className="flex items-start space-x-3">
            <Controller
              name="backupEnabled"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="backupEnabled"
                  checked={field.value ?? backupEnabled.default}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      checked === "indeterminate" ? null : checked === true,
                    );
                  }}
                  disabled={isLoading || isSaving}
                />
              )}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="backupEnabled"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Enable automatic backups
              </label>
              <p className="text-xs text-muted-foreground">
                Automatically create database backups on a daily schedule.
                Manual backups can always be created regardless of this setting.
              </p>
            </div>
          </div>

          {/* Backup settings - only shown when enabled */}
          {currentBackupEnabled && (
            <div className="grid gap-6 md:grid-cols-2 pl-7">
              <Controller
                name="backupHour"
                control={control}
                render={({ field }) => (
                  <SettingsInput
                    label="Backup Hour"
                    type="number"
                    inputProps={{
                      ...field,
                      inputMode: "numeric",
                      min: 0,
                      max: 23,
                      value: field.value ?? backupHour.default,
                      onChange: (event) => {
                        const value = parseInt(event.target.value, 10);
                        if (Number.isNaN(value)) {
                          field.onChange(null);
                        } else {
                          field.onChange(Math.min(23, Math.max(0, value)));
                        }
                      },
                    }}
                    disabled={isLoading || isSaving}
                    helper={`Hour of the day (0-23) in UTC when automatic backups should run. Default: ${backupHour.default}:00 UTC.`}
                    current={`Effective: ${backupHour.effective}:00 UTC | Default: ${backupHour.default}:00 UTC`}
                  />
                )}
              />

              <Controller
                name="backupMaxCount"
                control={control}
                render={({ field }) => (
                  <SettingsInput
                    label="Max Backups to Keep"
                    type="number"
                    inputProps={{
                      ...field,
                      inputMode: "numeric",
                      min: 1,
                      max: 5,
                      value: field.value ?? backupMaxCount.default,
                      onChange: (event) => {
                        const value = parseInt(event.target.value, 10);
                        if (Number.isNaN(value)) {
                          field.onChange(null);
                        } else {
                          field.onChange(Math.min(5, Math.max(1, value)));
                        }
                      },
                    }}
                    disabled={isLoading || isSaving}
                    helper={`Maximum number of automatic backups to retain (1-5). Older backups are deleted automatically. Default: ${backupMaxCount.default}.`}
                    current={`Effective: ${backupMaxCount.effective} | Default: ${backupMaxCount.default}`}
                  />
                )}
              />
            </div>
          )}

          {/* Next scheduled backup */}
          {currentBackupEnabled && nextScheduled && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-7">
              <Clock className="h-4 w-4" />
              <span>
                Next scheduled backup: {formatBackupDate(nextScheduled)}
              </span>
            </div>
          )}

          <Separator />

          {/* Backup list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Backup History</div>
              <Button
                size="sm"
                onClick={onCreateBackup}
                disabled={isLoading || isCreatingBackup || isDeletingBackup}
              >
                {isCreatingBackup ? "Creating..." : "Create Backup Now"}
              </Button>
            </div>

            <ListPanel
              header={
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {backups.length} backup{backups.length !== 1 ? "s" : ""}
                  </span>
                </div>
              }
            >
              {backups.length === 0 ? (
                <EmptyState
                  icon={Archive}
                  title="No backups yet"
                  description="Create your first backup to protect your data."
                />
              ) : (
                backups.map((backup) => (
                  <ListItem
                    key={backup.filename}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {backup.filename}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatBackupDate(backup.createdAt)} ·{" "}
                          {formatFileSize(backup.size)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          backup.type === "auto" ? "secondary" : "default"
                        }
                        className="text-xs"
                      >
                        {backup.type === "auto" ? "Auto" : "Manual"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDeleteBackup(backup.filename)}
                        disabled={isDeletingBackup || isCreatingBackup}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </ListItem>
                ))
              )}
            </ListPanel>
          </div>

          <Separator />

          {/* Effective/Default values display */}
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Enabled</div>
              <div className="break-words font-mono text-xs">
                Effective: {backupEnabled.effective ? "Yes" : "No"} | Default:{" "}
                {backupEnabled.default ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Hour</div>
              <div className="break-words font-mono text-xs">
                Effective: {backupHour.effective}:00 UTC | Default:{" "}
                {backupHour.default}:00 UTC
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Max Count</div>
              <div className="break-words font-mono text-xs">
                Effective: {backupMaxCount.effective} | Default:{" "}
                {backupMaxCount.default}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
