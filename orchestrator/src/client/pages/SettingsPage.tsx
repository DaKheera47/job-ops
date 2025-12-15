/**
 * Settings page.
 */

import React, { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { AppSettings } from "../../shared/types"
import * as api from "../api"

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modelDraft, setModelDraft] = useState("")
  const [pipelineWebhookUrlDraft, setPipelineWebhookUrlDraft] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    api
      .getSettings()
      .then((data) => {
        if (!isMounted) return
        setSettings(data)
        setModelDraft(data.overrideModel ?? "")
        setPipelineWebhookUrlDraft(data.overridePipelineWebhookUrl ?? "")
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to load settings"
        toast.error(message)
      })
      .finally(() => {
        if (!isMounted) return
        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const effectiveModel = settings?.model ?? ""
  const defaultModel = settings?.defaultModel ?? ""
  const overrideModel = settings?.overrideModel
  const effectivePipelineWebhookUrl = settings?.pipelineWebhookUrl ?? ""
  const defaultPipelineWebhookUrl = settings?.defaultPipelineWebhookUrl ?? ""
  const overridePipelineWebhookUrl = settings?.overridePipelineWebhookUrl

  const canSave = useMemo(() => {
    if (!settings) return false
    const next = modelDraft.trim()
    const current = (overrideModel ?? "").trim()
    const nextWebhook = pipelineWebhookUrlDraft.trim()
    const currentWebhook = (overridePipelineWebhookUrl ?? "").trim()
    return next !== current || nextWebhook !== currentWebhook
  }, [modelDraft, overrideModel, settings, pipelineWebhookUrlDraft, overridePipelineWebhookUrl])

  const handleSave = async () => {
    if (!settings) return
    try {
      setIsSaving(true)
      const trimmed = modelDraft.trim()
      const webhookTrimmed = pipelineWebhookUrlDraft.trim()
      const updated = await api.updateSettings({
        model: trimmed.length > 0 ? trimmed : null,
        pipelineWebhookUrl: webhookTrimmed.length > 0 ? webhookTrimmed : null,
      })
      setSettings(updated)
      setModelDraft(updated.overrideModel ?? "")
      setPipelineWebhookUrlDraft(updated.overridePipelineWebhookUrl ?? "")
      toast.success("Settings saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      setIsSaving(true)
      const updated = await api.updateSettings({ model: null, pipelineWebhookUrl: null })
      setSettings(updated)
      setModelDraft("")
      setPipelineWebhookUrlDraft("")
      toast.success("Reset to default")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset settings"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure runtime behavior for this app.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
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

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectiveModel || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{defaultModel || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Webhook</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Pipeline status webhook URL</div>
            <Input
              value={pipelineWebhookUrlDraft}
              onChange={(event) => setPipelineWebhookUrlDraft(event.target.value)}
              placeholder={defaultPipelineWebhookUrl || "https://..."}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              When set, the server sends a POST on pipeline completion/failure. Leave blank to disable.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectivePipelineWebhookUrl || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{defaultPipelineWebhookUrl || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={isLoading || isSaving || !canSave}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isLoading || isSaving || !settings}>
          Reset to default
        </Button>
      </div>
    </main>
  )
}
