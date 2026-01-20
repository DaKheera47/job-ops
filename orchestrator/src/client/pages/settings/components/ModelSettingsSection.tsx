import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type ModelSettingsSectionProps = {
  modelDraft: string
  setModelDraft: (value: string) => void
  modelScorerDraft: string
  setModelScorerDraft: (value: string) => void
  modelTailoringDraft: string
  setModelTailoringDraft: (value: string) => void
  modelProjectSelectionDraft: string
  setModelProjectSelectionDraft: (value: string) => void
  effectiveModel: string
  effectiveModelScorer: string
  effectiveModelTailoring: string
  effectiveModelProjectSelection: string
  defaultModel: string
  isLoading: boolean
  isSaving: boolean
}

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  modelDraft,
  setModelDraft,
  modelScorerDraft,
  setModelScorerDraft,
  modelTailoringDraft,
  setModelTailoringDraft,
  modelProjectSelectionDraft,
  setModelProjectSelectionDraft,
  effectiveModel,
  effectiveModelScorer,
  effectiveModelTailoring,
  effectiveModelProjectSelection,
  defaultModel,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="model" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Model</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Override model</div>
            <Input
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder={defaultModel || "openai/gpt-4o-mini"}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              Leave blank to use the default from server env (`MODEL`).
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="text-sm font-medium">Task-Specific Overrides</div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm">Scoring Model</div>
                <Input
                  value={modelScorerDraft}
                  onChange={(event) => setModelScorerDraft(event.target.value)}
                  placeholder={effectiveModel || "inherit"}
                  disabled={isLoading || isSaving}
                />
                <div className="text-xs text-muted-foreground">
                  Effective: <span className="font-mono">{effectiveModelScorer || effectiveModel}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">Tailoring Model</div>
                <Input
                  value={modelTailoringDraft}
                  onChange={(event) => setModelTailoringDraft(event.target.value)}
                  placeholder={effectiveModel || "inherit"}
                  disabled={isLoading || isSaving}
                />
                <div className="text-xs text-muted-foreground">
                  Effective: <span className="font-mono">{effectiveModelTailoring || effectiveModel}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">Project Selection Model</div>
                <Input
                  value={modelProjectSelectionDraft}
                  onChange={(event) => setModelProjectSelectionDraft(event.target.value)}
                  placeholder={effectiveModel || "inherit"}
                  disabled={isLoading || isSaving}
                />
                <div className="text-xs text-muted-foreground">
                  Effective: <span className="font-mono">{effectiveModelProjectSelection || effectiveModel}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Global Effective</div>
              <div className="break-words font-mono text-xs">{effectiveModel || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{defaultModel || "—"}</div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
