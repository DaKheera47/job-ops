import { TokenizedInput } from "@client/pages/orchestrator/TokenizedInput";
import {
  getMatchingWritingStylePresetId,
  resolveWritingStyleDraft,
  WRITING_STYLE_PRESETS,
} from "@client/pages/settings/constants";
import type { ChatValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type ChatSettingsSectionProps = {
  values: ChatValues;
  isLoading: boolean;
  isSaving: boolean;
};

function parseTokenizedTerms(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseStoredTerms(value: string | null | undefined): string[] {
  return parseTokenizedTerms(value ?? "");
}

function normalizeBlank(value: string | null | undefined): string | undefined {
  return value == null || value === "" ? undefined : value;
}

export const ChatSettingsSection: React.FC<ChatSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const { tone, formality, constraints, doNotUse } = values;

  const { control, register, setValue } = useFormContext<UpdateSettingsInput>();
  const [doNotUseDraft, setDoNotUseDraft] = useState("");
  const [toneValue, formalityValue, constraintsValue, doNotUseValue] = useWatch(
    {
      control,
      name: [
        "chatStyleTone",
        "chatStyleFormality",
        "chatStyleConstraints",
        "chatStyleDoNotUse",
      ],
    },
  );
  const toneDraft = normalizeBlank(toneValue);
  const formalityDraft = normalizeBlank(formalityValue);
  const constraintsDraft = normalizeBlank(constraintsValue);
  const doNotUseDraftValue = normalizeBlank(doNotUseValue);
  const resolvedStyle = resolveWritingStyleDraft({
    values: {
      tone: toneDraft,
      formality: formalityDraft,
      constraints: constraintsDraft,
      doNotUse: doNotUseDraftValue,
    },
    defaults: values,
  });
  const selectedPresetId =
    getMatchingWritingStylePresetId(resolvedStyle) ?? "custom";
  const doNotUseTokens = parseStoredTerms(
    doNotUseDraftValue ?? doNotUse.default,
  );

  return (
    <AccordionItem value="chat" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Writing Style</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These defaults shape AI-generated writing across Ghostwriter and
            resume tailoring.
          </p>

          <div className="space-y-2">
            <label htmlFor="writingStylePreset" className="text-sm font-medium">
              Preset
            </label>
            <Select
              value={selectedPresetId}
              onValueChange={(value) => {
                if (value === "custom") return;

                const preset = WRITING_STYLE_PRESETS.find(
                  (item) => item.id === value,
                );
                if (!preset) return;

                setValue("chatStyleTone", preset.values.tone, {
                  shouldDirty: true,
                });
                setValue("chatStyleFormality", preset.values.formality, {
                  shouldDirty: true,
                });
                setValue("chatStyleConstraints", preset.values.constraints, {
                  shouldDirty: true,
                });
                setValue("chatStyleDoNotUse", preset.values.doNotUse, {
                  shouldDirty: true,
                });
              }}
              disabled={isLoading || isSaving}
            >
              <SelectTrigger id="writingStylePreset">
                <SelectValue placeholder="Choose a writing preset" />
              </SelectTrigger>
              <SelectContent>
                {WRITING_STYLE_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {selectedPresetId === "custom"
                ? "Your current values are custom."
                : (WRITING_STYLE_PRESETS.find(
                    (preset) => preset.id === selectedPresetId,
                  )?.description ?? "")}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="chatStyleTone" className="text-sm font-medium">
                Tone
              </label>
              <Controller
                name="chatStyleTone"
                control={control}
                render={({ field }) => (
                  <Select
                    value={normalizeBlank(field.value) ?? tone.default}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={isLoading || isSaving}
                  >
                    <SelectTrigger id="chatStyleTone">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="concise">Concise</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="chatStyleFormality"
                className="text-sm font-medium"
              >
                Formality
              </label>
              <Controller
                name="chatStyleFormality"
                control={control}
                render={({ field }) => (
                  <Select
                    value={normalizeBlank(field.value) ?? formality.default}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={isLoading || isSaving}
                  >
                    <SelectTrigger id="chatStyleFormality">
                      <SelectValue placeholder="Select formality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="chatStyleConstraints"
              className="text-sm font-medium"
            >
              Constraints
            </label>
            <Textarea
              id="chatStyleConstraints"
              placeholder="Example: keep answers under 120 words and include bullet points"
              disabled={isLoading || isSaving}
              {...register("chatStyleConstraints")}
            />
            <div className="text-xs text-muted-foreground">
              Optional global writing constraints applied to Ghostwriter replies
              and resume tailoring.
            </div>
            <div className="text-xs text-muted-foreground">
              Current:{" "}
              <span className="font-mono">{constraints.effective || "—"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="chatStyleDoNotUse" className="text-sm font-medium">
              Do-not-use terms
            </label>
            <TokenizedInput
              id="chatStyleDoNotUse"
              values={doNotUseTokens}
              draft={doNotUseDraft}
              parseInput={parseTokenizedTerms}
              onDraftChange={setDoNotUseDraft}
              onValuesChange={(nextValues) =>
                setValue("chatStyleDoNotUse", nextValues.join(", "), {
                  shouldDirty: true,
                })
              }
              placeholder='e.g. "synergize", "leverage"'
              helperText="Optional words or phrases the AI should avoid when generating text. This is guidance to the model, not a guaranteed blocklist."
              removeLabelPrefix="Remove do-not-use term"
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              Current:{" "}
              <span className="font-mono">{doNotUse.effective || "—"}</span>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Tone</div>
              <div className="break-words font-mono text-xs">
                Effective: {tone.effective} | Default: {tone.default}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Formality</div>
              <div className="break-words font-mono text-xs">
                Effective: {formality.effective} | Default: {formality.default}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
