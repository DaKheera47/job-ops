import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { WebhookValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

type WebhooksSectionProps = {
  pipelineWebhook: WebhookValues;
  jobCompleteWebhook: WebhookValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const WebhooksSection: React.FC<WebhooksSectionProps> = ({
  pipelineWebhook,
  jobCompleteWebhook,
  isLoading,
  isSaving,
}) => {
  const {
    register,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem
      id="settings-section-webhooks"
      value="webhooks"
      className="rounded-xl border border-border/80 bg-card/80 px-4 shadow-sm"
    >
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Webhooks</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="text-sm font-medium">Pipeline Status</div>
            <SettingsInput
              label="Webhook URL"
              inputProps={register("pipelineWebhookUrl")}
              placeholder={pipelineWebhook.default || "https://..."}
              disabled={isLoading || isSaving}
              error={errors.pipelineWebhookUrl?.message as string | undefined}
              helper="When set, the server sends a POST on pipeline completion or failure."
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="text-sm font-medium">Job Completion</div>
            <div className="space-y-4">
              <SettingsInput
                label="Webhook URL"
                inputProps={register("jobCompleteWebhookUrl")}
                placeholder={jobCompleteWebhook.default || "https://..."}
                disabled={isLoading || isSaving}
                error={
                  errors.jobCompleteWebhookUrl?.message as string | undefined
                }
                helper="When set, the server sends a POST when you mark a job as applied, including the job description."
              />

              <SettingsInput
                label="Webhook Secret"
                inputProps={register("webhookSecret")}
                type="password"
                placeholder="Enter new secret"
                disabled={isLoading || isSaving}
                error={errors.webhookSecret?.message as string | undefined}
                helper="Secret sent to webhook (Bearer token)"
              />
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
