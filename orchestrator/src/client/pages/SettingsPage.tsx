/**
 * Settings page.
 */

import React, { useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AppSettings, ResumeProjectsSettings } from "../../shared/types"
import * as api from "../api"

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function resumeProjectsEqual(a: ResumeProjectsSettings, b: ResumeProjectsSettings) {
  return (
    a.maxProjects === b.maxProjects &&
    arraysEqual(a.lockedProjectIds, b.lockedProjectIds) &&
    arraysEqual(a.aiSelectableProjectIds, b.aiSelectableProjectIds)
  )
}

function clampInt(value: number, min: number, max: number) {
  const int = Math.floor(value)
  if (Number.isNaN(int)) return min
  return Math.min(max, Math.max(min, int))
}

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modelDraft, setModelDraft] = useState("")
  const [pipelineWebhookUrlDraft, setPipelineWebhookUrlDraft] = useState("")
  const [jobCompleteWebhookUrlDraft, setJobCompleteWebhookUrlDraft] = useState("")
  const [resumeProjectsDraft, setResumeProjectsDraft] = useState<ResumeProjectsSettings | null>(null)
  const [ukvisajobsMaxJobsDraft, setUkvisajobsMaxJobsDraft] = useState<number | null>(null)
  const [searchTermsDraft, setSearchTermsDraft] = useState<string[] | null>(null)
  const [jobspyLocationDraft, setJobspyLocationDraft] = useState<string | null>(null)
  const [jobspyResultsWantedDraft, setJobspyResultsWantedDraft] = useState<number | null>(null)
  const [jobspyHoursOldDraft, setJobspyHoursOldDraft] = useState<number | null>(null)
  const [jobspyCountryIndeedDraft, setJobspyCountryIndeedDraft] = useState<string | null>(null)
  const [jobspyLinkedinFetchDescriptionDraft, setJobspyLinkedinFetchDescriptionDraft] = useState<boolean | null>(null)
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
        setJobCompleteWebhookUrlDraft(data.overrideJobCompleteWebhookUrl ?? "")
        setResumeProjectsDraft(data.resumeProjects)
        setUkvisajobsMaxJobsDraft(data.overrideUkvisajobsMaxJobs)
        setSearchTermsDraft(data.overrideSearchTerms)
        setJobspyLocationDraft(data.overrideJobspyLocation)
        setJobspyResultsWantedDraft(data.overrideJobspyResultsWanted)
        setJobspyHoursOldDraft(data.overrideJobspyHoursOld)
        setJobspyCountryIndeedDraft(data.overrideJobspyCountryIndeed)
        setJobspyLinkedinFetchDescriptionDraft(data.overrideJobspyLinkedinFetchDescription)
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
  const effectiveJobCompleteWebhookUrl = settings?.jobCompleteWebhookUrl ?? ""
  const defaultJobCompleteWebhookUrl = settings?.defaultJobCompleteWebhookUrl ?? ""
  const overrideJobCompleteWebhookUrl = settings?.overrideJobCompleteWebhookUrl
  const effectiveUkvisajobsMaxJobs = settings?.ukvisajobsMaxJobs ?? 50
  const defaultUkvisajobsMaxJobs = settings?.defaultUkvisajobsMaxJobs ?? 50
  const overrideUkvisajobsMaxJobs = settings?.overrideUkvisajobsMaxJobs
  const effectiveSearchTerms = settings?.searchTerms ?? []
  const defaultSearchTerms = settings?.defaultSearchTerms ?? []
  const overrideSearchTerms = settings?.overrideSearchTerms
  const effectiveJobspyLocation = settings?.jobspyLocation ?? ""
  const defaultJobspyLocation = settings?.defaultJobspyLocation ?? ""
  const overrideJobspyLocation = settings?.overrideJobspyLocation
  const effectiveJobspyResultsWanted = settings?.jobspyResultsWanted ?? 200
  const defaultJobspyResultsWanted = settings?.defaultJobspyResultsWanted ?? 200
  const overrideJobspyResultsWanted = settings?.overrideJobspyResultsWanted
  const effectiveJobspyHoursOld = settings?.jobspyHoursOld ?? 72
  const defaultJobspyHoursOld = settings?.defaultJobspyHoursOld ?? 72
  const overrideJobspyHoursOld = settings?.overrideJobspyHoursOld
  const effectiveJobspyCountryIndeed = settings?.jobspyCountryIndeed ?? ""
  const defaultJobspyCountryIndeed = settings?.defaultJobspyCountryIndeed ?? ""
  const overrideJobspyCountryIndeed = settings?.overrideJobspyCountryIndeed
  const effectiveJobspyLinkedinFetchDescription = settings?.jobspyLinkedinFetchDescription ?? true
  const defaultJobspyLinkedinFetchDescription = settings?.defaultJobspyLinkedinFetchDescription ?? true
  const overrideJobspyLinkedinFetchDescription = settings?.overrideJobspyLinkedinFetchDescription
  const profileProjects = settings?.profileProjects ?? []
  const maxProjectsTotal = profileProjects.length
  const lockedCount = resumeProjectsDraft?.lockedProjectIds.length ?? 0

  const canSave = useMemo(() => {
    if (!settings || !resumeProjectsDraft) return false
    const next = modelDraft.trim()
    const current = (overrideModel ?? "").trim()
    const nextWebhook = pipelineWebhookUrlDraft.trim()
    const currentWebhook = (overridePipelineWebhookUrl ?? "").trim()
    const nextJobCompleteWebhook = jobCompleteWebhookUrlDraft.trim()
    const currentJobCompleteWebhook = (overrideJobCompleteWebhookUrl ?? "").trim()
    const ukvisajobsChanged = ukvisajobsMaxJobsDraft !== (overrideUkvisajobsMaxJobs ?? null)
    const searchTermsChanged = JSON.stringify(searchTermsDraft) !== JSON.stringify(overrideSearchTerms ?? null)
    return (
      next !== current ||
      nextWebhook !== currentWebhook ||
      nextJobCompleteWebhook !== currentJobCompleteWebhook ||
      !resumeProjectsEqual(resumeProjectsDraft, settings.resumeProjects) ||
      ukvisajobsChanged ||
      searchTermsChanged ||
      jobspyLocationDraft !== (overrideJobspyLocation ?? null) ||
      jobspyResultsWantedDraft !== (overrideJobspyResultsWanted ?? null) ||
      jobspyHoursOldDraft !== (overrideJobspyHoursOld ?? null) ||
      jobspyCountryIndeedDraft !== (overrideJobspyCountryIndeed ?? null) ||
      jobspyLinkedinFetchDescriptionDraft !== (overrideJobspyLinkedinFetchDescription ?? null)
    )
  }, [
    settings,
    modelDraft,
    pipelineWebhookUrlDraft,
    jobCompleteWebhookUrlDraft,
    overrideModel,
    overridePipelineWebhookUrl,
    overrideJobCompleteWebhookUrl,
    resumeProjectsDraft,
    ukvisajobsMaxJobsDraft,
    overrideUkvisajobsMaxJobs,
    searchTermsDraft,
    overrideSearchTerms,
    jobspyLocationDraft,
    jobspyResultsWantedDraft,
    jobspyHoursOldDraft,
    jobspyCountryIndeedDraft,
    jobspyLinkedinFetchDescriptionDraft,
    overrideJobspyLocation,
    overrideJobspyResultsWanted,
    overrideJobspyHoursOld,
    overrideJobspyCountryIndeed,
    overrideJobspyLinkedinFetchDescription,
  ])

  const handleSave = async () => {
    if (!settings || !resumeProjectsDraft) return
    try {
      setIsSaving(true)
      const trimmed = modelDraft.trim()
      const webhookTrimmed = pipelineWebhookUrlDraft.trim()
      const jobCompleteTrimmed = jobCompleteWebhookUrlDraft.trim()
      const resumeProjectsOverride = resumeProjectsEqual(resumeProjectsDraft, settings.defaultResumeProjects)
        ? null
        : resumeProjectsDraft
      const ukvisajobsMaxJobsOverride = ukvisajobsMaxJobsDraft === defaultUkvisajobsMaxJobs ? null : ukvisajobsMaxJobsDraft
      const searchTermsOverride = arraysEqual(searchTermsDraft ?? [], defaultSearchTerms) ? null : searchTermsDraft
      const jobspyLocationOverride = jobspyLocationDraft === defaultJobspyLocation ? null : jobspyLocationDraft
      const jobspyResultsWantedOverride = jobspyResultsWantedDraft === defaultJobspyResultsWanted ? null : jobspyResultsWantedDraft
      const jobspyHoursOldOverride = jobspyHoursOldDraft === defaultJobspyHoursOld ? null : jobspyHoursOldDraft
      const jobspyCountryIndeedOverride = jobspyCountryIndeedDraft === defaultJobspyCountryIndeed ? null : jobspyCountryIndeedDraft
      const jobspyLinkedinFetchDescriptionOverride = jobspyLinkedinFetchDescriptionDraft === defaultJobspyLinkedinFetchDescription ? null : jobspyLinkedinFetchDescriptionDraft
      const updated = await api.updateSettings({
        model: trimmed.length > 0 ? trimmed : null,
        pipelineWebhookUrl: webhookTrimmed.length > 0 ? webhookTrimmed : null,
        jobCompleteWebhookUrl: jobCompleteTrimmed.length > 0 ? jobCompleteTrimmed : null,
        resumeProjects: resumeProjectsOverride,
        ukvisajobsMaxJobs: ukvisajobsMaxJobsOverride,
        searchTerms: searchTermsOverride,
        jobspyLocation: jobspyLocationOverride,
        jobspyResultsWanted: jobspyResultsWantedOverride,
        jobspyHoursOld: jobspyHoursOldOverride,
        jobspyCountryIndeed: jobspyCountryIndeedOverride,
        jobspyLinkedinFetchDescription: jobspyLinkedinFetchDescriptionOverride,
      })
      setSettings(updated)
      setModelDraft(updated.overrideModel ?? "")
      setPipelineWebhookUrlDraft(updated.overridePipelineWebhookUrl ?? "")
      setJobCompleteWebhookUrlDraft(updated.overrideJobCompleteWebhookUrl ?? "")
      setResumeProjectsDraft(updated.resumeProjects)
      setUkvisajobsMaxJobsDraft(updated.overrideUkvisajobsMaxJobs)
      setSearchTermsDraft(updated.overrideSearchTerms)
      setJobspyLocationDraft(updated.overrideJobspyLocation)
      setJobspyResultsWantedDraft(updated.overrideJobspyResultsWanted)
      setJobspyHoursOldDraft(updated.overrideJobspyHoursOld)
      setJobspyCountryIndeedDraft(updated.overrideJobspyCountryIndeed)
      setJobspyLinkedinFetchDescriptionDraft(updated.overrideJobspyLinkedinFetchDescription)
      toast.success("Settings saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }
  const handleClearDatabase = async () => {
    try {
      setIsSaving(true)
      const result = await api.clearDatabase()
      toast.success("Database cleared", { description: `Deleted ${result.jobsDeleted} jobs.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear database"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearDiscovered = async () => {
    try {
      setIsSaving(true)
      const result = await api.deleteJobsByStatus("discovered")
      toast.success("Discovered jobs cleared", { description: `Deleted ${result.count} jobs.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear discovered jobs"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }
  const handleReset = async () => {
    try {
      setIsSaving(true)
      const updated = await api.updateSettings({
        model: null,
        pipelineWebhookUrl: null,
        jobCompleteWebhookUrl: null,
        resumeProjects: null,
        ukvisajobsMaxJobs: null,
        searchTerms: null,
        jobspyLocation: null,
        jobspyResultsWanted: null,
        jobspyHoursOld: null,
        jobspyCountryIndeed: null,
        jobspyLinkedinFetchDescription: null,
      })
      setSettings(updated)
      setModelDraft("")
      setPipelineWebhookUrlDraft("")
      setJobCompleteWebhookUrlDraft("")
      setResumeProjectsDraft(updated.resumeProjects)
      setUkvisajobsMaxJobsDraft(null)
      setSearchTermsDraft(null)
      setJobspyLocationDraft(null)
      setJobspyResultsWantedDraft(null)
      setJobspyHoursOldDraft(null)
      setJobspyCountryIndeedDraft(null)
      setJobspyLinkedinFetchDescriptionDraft(null)
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Complete Webhook</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Job completion webhook URL</div>
            <Input
              value={jobCompleteWebhookUrlDraft}
              onChange={(event) => setJobCompleteWebhookUrlDraft(event.target.value)}
              placeholder={defaultJobCompleteWebhookUrl || "https://..."}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              When set, the server sends a POST when you mark a job as applied (includes the job description).
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectiveJobCompleteWebhookUrl || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{defaultJobCompleteWebhookUrl || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UKVisaJobs Extractor</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Max jobs to fetch</div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={ukvisajobsMaxJobsDraft ?? defaultUkvisajobsMaxJobs}
              onChange={(event) => {
                const value = parseInt(event.target.value, 10)
                if (Number.isNaN(value)) {
                  setUkvisajobsMaxJobsDraft(null)
                } else {
                  setUkvisajobsMaxJobsDraft(Math.min(200, Math.max(1, value)))
                }
              }}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              Maximum number of jobs to fetch from UKVisaJobs per pipeline run. Range: 1-200.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectiveUkvisajobsMaxJobs}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default</div>
              <div className="break-words font-mono text-xs">{defaultUkvisajobsMaxJobs}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Terms</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Global search terms</div>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={searchTermsDraft ? searchTermsDraft.join('\n') : (defaultSearchTerms ?? []).join('\n')}
              onChange={(event) => {
                const text = event.target.value
                const terms = text.split('\n') // Don't filter here to allow empty lines while typing
                setSearchTermsDraft(terms)
              }}
              onBlur={() => {
                // Clean up on blur
                if (searchTermsDraft) {
                  setSearchTermsDraft(searchTermsDraft.map(t => t.trim()).filter(Boolean))
                }
              }}
              placeholder="e.g. web developer"
              disabled={isLoading || isSaving}
              rows={5}
            />
            <div className="text-xs text-muted-foreground">
              One term per line. Applies to UKVisaJobs and other supported extractors.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{(effectiveSearchTerms || []).join(', ') || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{(defaultSearchTerms || []).join(', ') || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">JobSpy Scraper</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Location</div>
              <Input
                value={jobspyLocationDraft ?? defaultJobspyLocation}
                onChange={(event) => setJobspyLocationDraft(event.target.value)}
                placeholder={defaultJobspyLocation || "UK"}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Location to search for jobs (e.g. "UK", "London", "Remote").
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyLocation || "—"}</span>
                <span>Default: {defaultJobspyLocation || "—"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Results Wanted</div>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={jobspyResultsWantedDraft ?? defaultJobspyResultsWanted}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10)
                  if (Number.isNaN(value)) {
                    setJobspyResultsWantedDraft(null)
                  } else {
                    setJobspyResultsWantedDraft(Math.min(500, Math.max(1, value)))
                  }
                }}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Number of results to fetch per term per site. Max 500.
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyResultsWanted}</span>
                <span>Default: {defaultJobspyResultsWanted}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Hours Old</div>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                value={jobspyHoursOldDraft ?? defaultJobspyHoursOld}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10)
                  if (Number.isNaN(value)) {
                    setJobspyHoursOldDraft(null)
                  } else {
                    setJobspyHoursOldDraft(Math.min(168, Math.max(1, value)))
                  }
                }}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Max age of jobs in hours (e.g. 72 for 3 days).
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyHoursOld}h</span>
                <span>Default: {defaultJobspyHoursOld}h</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Indeed Country</div>
              <Input
                value={jobspyCountryIndeedDraft ?? defaultJobspyCountryIndeed}
                onChange={(event) => setJobspyCountryIndeedDraft(event.target.value)}
                placeholder={defaultJobspyCountryIndeed || "UK"}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Country domain for Indeed (e.g. "UK" for indeed.co.uk).
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyCountryIndeed || "—"}</span>
                <span>Default: {defaultJobspyCountryIndeed || "—"}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-2">
            <Checkbox
              id="linkedin-desc"
              checked={jobspyLinkedinFetchDescriptionDraft ?? defaultJobspyLinkedinFetchDescription}
              onCheckedChange={(checked) => setJobspyLinkedinFetchDescriptionDraft(!!checked)}
              disabled={isLoading || isSaving}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="linkedin-desc"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Fetch LinkedIn Description
              </label>
              <p className="text-xs text-muted-foreground">
                If enabled, JobSpy will make extra requests to fetch full descriptions. Slower but better data.
              </p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyLinkedinFetchDescription ? "Yes" : "No"}</span>
                <span>Default: {defaultJobspyLinkedinFetchDescription ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resume Projects</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Max projects included</div>
            <Input
              type="number"
              inputMode="numeric"
              min={lockedCount}
              max={maxProjectsTotal}
              value={resumeProjectsDraft?.maxProjects ?? 0}
              onChange={(event) => {
                if (!resumeProjectsDraft) return
                const next = Number(event.target.value)
                const clamped = clampInt(next, lockedCount, maxProjectsTotal)
                setResumeProjectsDraft({ ...resumeProjectsDraft, maxProjects: clamped })
              }}
              disabled={isLoading || isSaving || !resumeProjectsDraft}
            />
            <div className="text-xs text-muted-foreground">
              Locked projects always count towards this cap. Locked: {lockedCount} · AI pool:{" "}
              {resumeProjectsDraft?.aiSelectableProjectIds.length ?? 0} · Total projects: {maxProjectsTotal}
            </div>
          </div>

          <Separator />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="w-[110px]">Base visible</TableHead>
                <TableHead className="w-[90px]">Locked</TableHead>
                <TableHead className="w-[140px]">AI selectable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profileProjects.map((project) => {
                const locked = Boolean(resumeProjectsDraft?.lockedProjectIds.includes(project.id))
                const aiSelectable = Boolean(resumeProjectsDraft?.aiSelectableProjectIds.includes(project.id))
                const excluded = !locked && !aiSelectable

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{project.name || project.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {[project.description, project.date].filter(Boolean).join(" · ")}
                          {excluded ? " · Excluded" : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{project.isVisibleInBase ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={locked}
                        disabled={isLoading || isSaving || !resumeProjectsDraft}
                        onCheckedChange={(checked) => {
                          if (!resumeProjectsDraft) return
                          const isChecked = checked === true
                          const lockedIds = resumeProjectsDraft.lockedProjectIds.slice()
                          const selectableIds = resumeProjectsDraft.aiSelectableProjectIds.slice()

                          if (isChecked) {
                            if (!lockedIds.includes(project.id)) lockedIds.push(project.id)
                            const nextSelectable = selectableIds.filter((id) => id !== project.id)
                            const minCap = lockedIds.length
                            setResumeProjectsDraft({
                              ...resumeProjectsDraft,
                              lockedProjectIds: lockedIds,
                              aiSelectableProjectIds: nextSelectable,
                              maxProjects: Math.max(resumeProjectsDraft.maxProjects, minCap),
                            })
                            return
                          }

                          const nextLocked = lockedIds.filter((id) => id !== project.id)
                          if (!selectableIds.includes(project.id)) selectableIds.push(project.id)
                          setResumeProjectsDraft({
                            ...resumeProjectsDraft,
                            lockedProjectIds: nextLocked,
                            aiSelectableProjectIds: selectableIds,
                            maxProjects: clampInt(resumeProjectsDraft.maxProjects, nextLocked.length, maxProjectsTotal),
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={locked ? true : aiSelectable}
                        disabled={locked || isLoading || isSaving || !resumeProjectsDraft}
                        onCheckedChange={(checked) => {
                          if (!resumeProjectsDraft) return
                          const isChecked = checked === true
                          const selectableIds = resumeProjectsDraft.aiSelectableProjectIds.slice()
                          const nextSelectable = isChecked
                            ? selectableIds.includes(project.id)
                              ? selectableIds
                              : [...selectableIds, project.id]
                            : selectableIds.filter((id) => id !== project.id)
                          setResumeProjectsDraft({ ...resumeProjectsDraft, aiSelectableProjectIds: nextSelectable })
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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

      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that modify your database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Clear Discovered Jobs</div>
              <div className="text-xs text-muted-foreground">
                Delete all jobs with the status "discovered". Ready, applied, and rejected jobs are kept.
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isLoading || isSaving}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Discovered
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear discovered jobs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all jobs with the status "discovered". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearDiscovered} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Clear discovered
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Separator className="bg-destructive/10" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Clear Database</div>
              <div className="text-xs text-muted-foreground">
                Delete all jobs and pipeline runs from the database.
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isLoading || isSaving}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Database
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all jobs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all jobs and pipeline runs from the database. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearDatabase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Clear database
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
