import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { EnvSettingsValues } from "@client/pages/settings/types";
import { formatSecretHint } from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type EnvironmentSettingsSectionProps = {
  values: EnvSettingsValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

export const EnvironmentSettingsSection: React.FC<
  EnvironmentSettingsSectionProps
> = ({ values, isLoading, isSaving, layoutMode }) => {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const { private: privateValues } = values;

  const isBasicAuthEnabled = watch("enableBasicAuth");

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Environment & Accounts"
      value="environment"
    >
      <div className="space-y-8">
        <div className="space-y-6">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Service Accounts
          </div>

          <div className="space-y-4">
            <div className="text-sm font-semibold">UKVisaJobs</div>
            <div className="grid gap-4 md:grid-cols-2">
              <SettingsInput
                label="Email"
                inputProps={register("ukvisajobsEmail")}
                placeholder="you@example.com"
                disabled={isLoading || isSaving}
                error={errors.ukvisajobsEmail?.message as string | undefined}
              />
              <SettingsInput
                label="Password"
                inputProps={register("ukvisajobsPassword")}
                type="password"
                placeholder="Enter new password"
                disabled={isLoading || isSaving}
                error={errors.ukvisajobsPassword?.message as string | undefined}
                current={formatSecretHint(privateValues.ukvisajobsPasswordHint)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-semibold">Adzuna</div>
            <div className="grid gap-4 md:grid-cols-2">
              <SettingsInput
                label="App ID"
                inputProps={register("adzunaAppId")}
                placeholder="your-app-id"
                disabled={isLoading || isSaving}
                error={errors.adzunaAppId?.message as string | undefined}
              />
              <SettingsInput
                label="App Key"
                inputProps={register("adzunaAppKey")}
                type="password"
                placeholder="Enter new app key"
                disabled={isLoading || isSaving}
                error={errors.adzunaAppKey?.message as string | undefined}
                current={formatSecretHint(privateValues.adzunaAppKeyHint)}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Security
          </div>
          <div className="flex items-start space-x-3">
            <Controller
              name="enableBasicAuth"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="enableBasicAuth"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading || isSaving}
                />
              )}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="enableBasicAuth"
                className="cursor-pointer text-sm font-medium leading-none"
              >
                Enable basic authentication
              </label>
              <p className="text-xs text-muted-foreground">
                Require a username and password for write operations.
              </p>
            </div>
          </div>

          {isBasicAuthEnabled && (
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <SettingsInput
                label="Username"
                inputProps={register("basicAuthUser")}
                placeholder="username"
                disabled={isLoading || isSaving}
                error={errors.basicAuthUser?.message as string | undefined}
              />

              <SettingsInput
                label="Password"
                inputProps={register("basicAuthPassword")}
                type="password"
                placeholder="Enter new password"
                disabled={isLoading || isSaving}
                error={errors.basicAuthPassword?.message as string | undefined}
              />
            </div>
          )}
        </div>
      </div>
    </SettingsSectionFrame>
  );
};
