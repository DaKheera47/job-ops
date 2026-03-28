import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { EnvSettingsValues } from "@client/pages/settings/types";
import { formatSecretHint } from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type EnvironmentSettingsSectionProps = {
  values: EnvSettingsValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const EnvironmentSettingsSection: React.FC<
  EnvironmentSettingsSectionProps
> = ({ values, isLoading, isSaving }) => {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const { private: privateValues } = values;

  const isBasicAuthEnabled = watch("enableBasicAuth");

  return (
    <AccordionItem
      id="settings-section-environment"
      value="environment"
      className="rounded-xl border border-border/80 bg-card/80 px-4 shadow-sm"
    >
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Environment & Accounts</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-8">
          {/* Service Accounts */}
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
                  error={
                    errors.ukvisajobsPassword?.message as string | undefined
                  }
                  helper={
                    privateValues.ukvisajobsPasswordHint
                      ? `Saved password: ${formatSecretHint(privateValues.ukvisajobsPasswordHint)}`
                      : undefined
                  }
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
                  helper={
                    privateValues.adzunaAppKeyHint
                      ? `Saved key: ${formatSecretHint(privateValues.adzunaAppKeyHint)}`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Security */}
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
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Enable basic authentication
                </label>
                <p className="text-xs text-muted-foreground">
                  Require a username and password for write operations.
                </p>
              </div>
            </div>

            {isBasicAuthEnabled && (
              <div className="grid gap-4 md:grid-cols-2 pt-2">
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
                  error={
                    errors.basicAuthPassword?.message as string | undefined
                  }
                  helper={
                    privateValues.basicAuthPasswordHint
                      ? `Saved password: ${formatSecretHint(privateValues.basicAuthPasswordHint)}`
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
