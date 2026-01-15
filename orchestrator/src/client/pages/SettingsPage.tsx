/**
 * Settings page.
 */

import React, { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, Settings, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "../components/layout"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AppSettings, JobStatus, ResumeProjectsSettings } from "../../shared/types"
import * as api from "../api"

/** All available job statuses for clearing */
const ALL_JOB_STATUSES: JobStatus[] = ['discovered', 'processing', 'ready', 'applied', 'skipped', 'expired']

/** Status descriptions for UI */
const STATUS_DESCRIPTIONS: Record<JobStatus, string> = {
  discovered: 'Crawled but not processed',
  processing: 'Currently generating resume',
  ready: 'PDF generated, waiting for user to apply',
  applied: 'User marked as applied',
  skipped: 'User skipped this job',
  expired: 'Deadline passed',
}

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
  const [modelScorerDraft, setModelScorerDraft] = useState("")
  const [modelTailoringDraft, setModelTailoringDraft] = useState("")
  const [modelProjectSelectionDraft, setModelProjectSelectionDraft] = useState("")
  const [pipelineWebhookUrlDraft, setPipelineWebhookUrlDraft] = useState("")
  const [jobCompleteWebhookUrlDraft, setJobCompleteWebhookUrlDraft] = useState("")
  const [resumeProjectsDraft, setResumeProjectsDraft] = useState<ResumeProjectsSettings | null>(null)
  const [ukvisajobsMaxJobsDraft, setUkvisajobsMaxJobsDraft] = useState<number | null>(null)
  const [gradcrackerMaxJobsPerTermDraft, setGradcrackerMaxJobsPerTermDraft] = useState<number | null>(null)
  const [searchTermsDraft, setSearchTermsDraft] = useState<string[] | null>(null)
  const [jobspyLocationDraft, setJobspyLocationDraft] = useState<string | null>(null)
  const [jobspyResultsWantedDraft, setJobspyResultsWantedDraft] = useState<number | null>(null)
  const [jobspyHoursOldDraft, setJobspyHoursOldDraft] = useState<number | null>(null)
  const [jobspyCountryIndeedDraft, setJobspyCountryIndeedDraft] = useState<string | null>(null)
  const [jobspySitesDraft, setJobspySitesDraft] = useState<string[] | null>(null)
  const [jobspyLinkedinFetchDescriptionDraft, setJobspyLinkedinFetchDescriptionDraft] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [statusesToClear, setStatusesToClear] = useState<JobStatus[]>(['discovered'])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    api
      .getSettings()
      .then((data) => {
        if (!isMounted) return
        setSettings(data)
        setModelDraft(data.overrideModel ?? "")
        setModelScorerDraft(data.overrideModelScorer ?? "")
        setModelTailoringDraft(data.overrideModelTailoring ?? "")
        setModelProjectSelectionDraft(data.overrideModelProjectSelection ?? "")
        setPipelineWebhookUrlDraft(data.overridePipelineWebhookUrl ?? "")
        setJobCompleteWebhookUrlDraft(data.overrideJobCompleteWebhookUrl ?? "")
        setResumeProjectsDraft(data.resumeProjects)
        setUkvisajobsMaxJobsDraft(data.overrideUkvisajobsMaxJobs)
        setGradcrackerMaxJobsPerTermDraft(data.overrideGradcrackerMaxJobsPerTerm)
        setSearchTermsDraft(data.overrideSearchTerms)
        setJobspyLocationDraft(data.overrideJobspyLocation)
        setJobspyResultsWantedDraft(data.overrideJobspyResultsWanted)
        setJobspyHoursOldDraft(data.overrideJobspyHoursOld)
        setJobspyCountryIndeedDraft(data.overrideJobspyCountryIndeed)
        setJobspySitesDraft(data.overrideJobspySites)
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
  const effectiveModelScorer = settings?.modelScorer ?? ""
  const overrideModelScorer = settings?.overrideModelScorer
  const effectiveModelTailoring = settings?.modelTailoring ?? ""
  const overrideModelTailoring = settings?.overrideModelTailoring
  const effectiveModelProjectSelection = settings?.modelProjectSelection ?? ""
  const overrideModelProjectSelection = settings?.overrideModelProjectSelection
  const effectivePipelineWebhookUrl = settings?.pipelineWebhookUrl ?? ""
  const defaultPipelineWebhookUrl = settings?.defaultPipelineWebhookUrl ?? ""
  const overridePipelineWebhookUrl = settings?.overridePipelineWebhookUrl
  const effectiveJobCompleteWebhookUrl = settings?.jobCompleteWebhookUrl ?? ""
  const defaultJobCompleteWebhookUrl = settings?.defaultJobCompleteWebhookUrl ?? ""
  const overrideJobCompleteWebhookUrl = settings?.overrideJobCompleteWebhookUrl
  const effectiveUkvisajobsMaxJobs = settings?.ukvisajobsMaxJobs ?? 50
  const defaultUkvisajobsMaxJobs = settings?.defaultUkvisajobsMaxJobs ?? 50
  const overrideUkvisajobsMaxJobs = settings?.overrideUkvisajobsMaxJobs
  const effectiveGradcrackerMaxJobsPerTerm = settings?.gradcrackerMaxJobsPerTerm ?? 50
  const defaultGradcrackerMaxJobsPerTerm = settings?.defaultGradcrackerMaxJobsPerTerm ?? 50
  const overrideGradcrackerMaxJobsPerTerm = settings?.overrideGradcrackerMaxJobsPerTerm
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
  const effectiveJobspySites = settings?.jobspySites ?? ["indeed", "linkedin"]
  const defaultJobspySites = settings?.defaultJobspySites ?? ["indeed", "linkedin"]
  const overrideJobspySites = settings?.overrideJobspySites
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
    const nextScorer = modelScorerDraft.trim()
    const currentScorer = (overrideModelScorer ?? "").trim()
    const nextTailoring = modelTailoringDraft.trim()
    const currentTailoring = (overrideModelTailoring ?? "").trim()
    const nextProjectSelection = modelProjectSelectionDraft.trim()
    const currentProjectSelection = (overrideModelProjectSelection ?? "").trim()
    const nextWebhook = pipelineWebhookUrlDraft.trim()
    const currentWebhook = (overridePipelineWebhookUrl ?? "").trim()
    const nextJobCompleteWebhook = jobCompleteWebhookUrlDraft.trim()
    const currentJobCompleteWebhook = (overrideJobCompleteWebhookUrl ?? "").trim()
    const ukvisajobsChanged = ukvisajobsMaxJobsDraft !== (overrideUkvisajobsMaxJobs ?? null)
    const gradcrackerChanged = gradcrackerMaxJobsPerTermDraft !== (overrideGradcrackerMaxJobsPerTerm ?? null)
    const searchTermsChanged = JSON.stringify(searchTermsDraft) !== JSON.stringify(overrideSearchTerms ?? null)
    return (
      next !== current ||
      nextScorer !== currentScorer ||
      nextTailoring !== currentTailoring ||
      nextProjectSelection !== currentProjectSelection ||
      nextWebhook !== currentWebhook ||
      nextJobCompleteWebhook !== currentJobCompleteWebhook ||
      !resumeProjectsEqual(resumeProjectsDraft, settings.resumeProjects) ||
      ukvisajobsChanged ||
      gradcrackerChanged ||
      searchTermsChanged ||
      jobspyLocationDraft !== (overrideJobspyLocation ?? null) ||
      jobspyResultsWantedDraft !== (overrideJobspyResultsWanted ?? null) ||
      jobspyHoursOldDraft !== (overrideJobspyHoursOld ?? null) ||
      jobspyCountryIndeedDraft !== (overrideJobspyCountryIndeed ?? null) ||
      JSON.stringify((jobspySitesDraft ?? []).slice().sort()) !== JSON.stringify((overrideJobspySites ?? []).slice().sort()) ||
      jobspyLinkedinFetchDescriptionDraft !== (overrideJobspyLinkedinFetchDescription ?? null)
    )
  }, [
    settings,
    modelDraft,
    modelScorerDraft,
    modelTailoringDraft,
    modelProjectSelectionDraft,
    pipelineWebhookUrlDraft,
    jobCompleteWebhookUrlDraft,
    overrideModel,
    overrideModelScorer,
    overrideModelTailoring,
    overrideModelProjectSelection,
    overridePipelineWebhookUrl,
    overrideJobCompleteWebhookUrl,
    resumeProjectsDraft,
    ukvisajobsMaxJobsDraft,
    overrideUkvisajobsMaxJobs,
    gradcrackerMaxJobsPerTermDraft,
    overrideGradcrackerMaxJobsPerTerm,
    searchTermsDraft,
    overrideSearchTerms,
    jobspyLocationDraft,
    jobspyResultsWantedDraft,
    jobspyHoursOldDraft,
    jobspyCountryIndeedDraft,
    jobspySitesDraft,
    jobspyLinkedinFetchDescriptionDraft,
    overrideJobspyLocation,
    overrideJobspyResultsWanted,
    overrideJobspyHoursOld,
    overrideJobspyCountryIndeed,
    overrideJobspySites,
    overrideJobspyLinkedinFetchDescription,
  ])

  const handleSave = async () => {
    if (!settings || !resumeProjectsDraft) return
    try {
      setIsSaving(true)
      const trimmed = modelDraft.trim()
      const trimmedScorer = modelScorerDraft.trim()
      const trimmedTailoring = modelTailoringDraft.trim()
      const trimmedProjectSelection = modelProjectSelectionDraft.trim()
      const webhookTrimmed = pipelineWebhookUrlDraft.trim()
      const jobCompleteTrimmed = jobCompleteWebhookUrlDraft.trim()
      const resumeProjectsOverride = resumeProjectsEqual(resumeProjectsDraft, settings.defaultResumeProjects)
        ? null
        : resumeProjectsDraft
      const ukvisajobsMaxJobsOverride = ukvisajobsMaxJobsDraft === defaultUkvisajobsMaxJobs ? null : ukvisajobsMaxJobsDraft
      const gradcrackerMaxJobsPerTermOverride = gradcrackerMaxJobsPerTermDraft === defaultGradcrackerMaxJobsPerTerm ? null : gradcrackerMaxJobsPerTermDraft
      const searchTermsOverride = arraysEqual(searchTermsDraft ?? [], defaultSearchTerms) ? null : searchTermsDraft
      const jobspyLocationOverride = jobspyLocationDraft === defaultJobspyLocation ? null : jobspyLocationDraft
      const jobspyResultsWantedOverride = jobspyResultsWantedDraft === defaultJobspyResultsWanted ? null : jobspyResultsWantedDraft
      const jobspyHoursOldOverride = jobspyHoursOldDraft === defaultJobspyHoursOld ? null : jobspyHoursOldDraft
      const jobspyCountryIndeedOverride = jobspyCountryIndeedDraft === defaultJobspyCountryIndeed ? null : jobspyCountryIndeedDraft
      const jobspySitesOverride = arraysEqual((jobspySitesDraft ?? []).slice().sort(), (defaultJobspySites ?? []).slice().sort()) ? null : jobspySitesDraft
      const jobspyLinkedinFetchDescriptionOverride = jobspyLinkedinFetchDescriptionDraft === defaultJobspyLinkedinFetchDescription ? null : jobspyLinkedinFetchDescriptionDraft
      const updated = await api.updateSettings({
        model: trimmed.length > 0 ? trimmed : null,
        modelScorer: trimmedScorer.length > 0 ? trimmedScorer : null,
        modelTailoring: trimmedTailoring.length > 0 ? trimmedTailoring : null,
        modelProjectSelection: trimmedProjectSelection.length > 0 ? trimmedProjectSelection : null,
        pipelineWebhookUrl: webhookTrimmed.length > 0 ? webhookTrimmed : null,
        jobCompleteWebhookUrl: jobCompleteTrimmed.length > 0 ? jobCompleteTrimmed : null,
        resumeProjects: resumeProjectsOverride,
        ukvisajobsMaxJobs: ukvisajobsMaxJobsOverride,
        gradcrackerMaxJobsPerTerm: gradcrackerMaxJobsPerTermOverride,
        searchTerms: searchTermsOverride,
        jobspyLocation: jobspyLocationOverride,
        jobspyResultsWanted: jobspyResultsWantedOverride,
        jobspyHoursOld: jobspyHoursOldOverride,
        jobspyCountryIndeed: jobspyCountryIndeedOverride,
        jobspySites: jobspySitesOverride,
        jobspyLinkedinFetchDescription: jobspyLinkedinFetchDescriptionOverride,
      })
      setSettings(updated)
      setModelDraft(updated.overrideModel ?? "")
      setModelScorerDraft(updated.overrideModelScorer ?? "")
      setModelTailoringDraft(updated.overrideModelTailoring ?? "")
      setModelProjectSelectionDraft(updated.overrideModelProjectSelection ?? "")
      setPipelineWebhookUrlDraft(updated.overridePipelineWebhookUrl ?? "")
      setJobCompleteWebhookUrlDraft(updated.overrideJobCompleteWebhookUrl ?? "")
      setResumeProjectsDraft(updated.resumeProjects)
      setUkvisajobsMaxJobsDraft(updated.overrideUkvisajobsMaxJobs)
      setGradcrackerMaxJobsPerTermDraft(updated.overrideGradcrackerMaxJobsPerTerm)
      setSearchTermsDraft(updated.overrideSearchTerms)
      setJobspyLocationDraft(updated.overrideJobspyLocation)
      setJobspyResultsWantedDraft(updated.overrideJobspyResultsWanted)
      setJobspyHoursOldDraft(updated.overrideJobspyHoursOld)
      setJobspyCountryIndeedDraft(updated.overrideJobspyCountryIndeed)
      setJobspySitesDraft(updated.overrideJobspySites)
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

  const handleClearByStatuses = async () => {
    if (statusesToClear.length === 0) {
      toast.error("No statuses selected")
      return
    }
    try {
      setIsSaving(true)
      let totalDeleted = 0
      const results: string[] = []
      
      for (const status of statusesToClear) {
        const result = await api.deleteJobsByStatus(status)
        totalDeleted += result.count
        if (result.count > 0) {
          results.push(`${result.count} ${status}`)
        }
      }
      
      if (totalDeleted > 0) {
        toast.success("Jobs cleared", { 
          description: `Deleted ${totalDeleted} jobs: ${results.join(', ')}` 
        })
      } else {
        toast.info("No jobs found", { 
          description: `No jobs with selected statuses found` 
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear jobs"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleStatusToClear = (status: JobStatus) => {
    setStatusesToClear(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }
  const handleReset = async () => {
    try {
      setIsSaving(true)
      const updated = await api.updateSettings({
        model: null,
        modelScorer: null,
        modelTailoring: null,
        modelProjectSelection: null,
        pipelineWebhookUrl: null,
        jobCompleteWebhookUrl: null,
        resumeProjects: null,
        ukvisajobsMaxJobs: null,
        gradcrackerMaxJobsPerTerm: null,
        searchTerms: null,
        jobspyLocation: null,
        jobspyResultsWanted: null,
        jobspyHoursOld: null,
        jobspyCountryIndeed: null,
        jobspySites: null,
        jobspyLinkedinFetchDescription: null,
      })
      setSettings(updated)
      setModelDraft("")
      setModelScorerDraft("")
      setModelTailoringDraft("")
      setModelProjectSelectionDraft("")
      setPipelineWebhookUrlDraft("")
      setJobCompleteWebhookUrlDraft("")
      setResumeProjectsDraft(updated.resumeProjects)
      setUkvisajobsMaxJobsDraft(null)
      setGradcrackerMaxJobsPerTermDraft(null)
      setSearchTermsDraft(null)
      setJobspyLocationDraft(null)
      setJobspyResultsWantedDraft(null)
      setJobspyHoursOldDraft(null)
      setJobspyCountryIndeedDraft(null)
      setJobspySitesDraft(null)
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
    <>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure runtime behavior for this app."
        nav={[{ icon: ArrowLeft, label: "Back to Orchestrator", to: "/" }]}
      />

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12">
        <Accordion type="multiple" className="w-full space-y-4">
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

        <AccordionItem value="pipeline-webhook" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">Pipeline Webhook</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
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
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="job-complete-webhook" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">Job Complete Webhook</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
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
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ukvisajobs" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">UKVisaJobs Extractor</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Max jobs to fetch</div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={ukvisajobsMaxJobsDraft ?? defaultUkvisajobsMaxJobs}
                  onChange={(event) => {
                    const value = parseInt(event.target.value, 10)
                    if (Number.isNaN(value)) {
                      setUkvisajobsMaxJobsDraft(null)
                    } else {
                      setUkvisajobsMaxJobsDraft(Math.min(1000, Math.max(1, value)))
                    }
                  }}
                  disabled={isLoading || isSaving}
                />
                <div className="text-xs text-muted-foreground">
                  Maximum number of jobs to fetch from UKVisaJobs per pipeline run. Range: 1-1000.
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
                  <div className="break-words font-mono text-xs font-semibold">{defaultUkvisajobsMaxJobs}</div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="gradcracker" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">Gradcracker Extractor</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Max jobs per search term</div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={gradcrackerMaxJobsPerTermDraft ?? defaultGradcrackerMaxJobsPerTerm}
                  onChange={(event) => {
                    const value = parseInt(event.target.value, 10)
                    if (Number.isNaN(value)) {
                      setGradcrackerMaxJobsPerTermDraft(null)
                    } else {
                      setGradcrackerMaxJobsPerTermDraft(Math.min(1000, Math.max(1, value)))
                    }
                  }}
                  disabled={isLoading || isSaving}
                />
                <div className="text-xs text-muted-foreground">
                  Maximum number of jobs to fetch for EACH search term from Gradcracker. Range: 1-1000.
                </div>
              </div>

              <Separator />

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Effective</div>
                  <div className="break-words font-mono text-xs">{effectiveGradcrackerMaxJobsPerTerm}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Default</div>
                  <div className="break-words font-mono text-xs font-semibold">{defaultGradcrackerMaxJobsPerTerm}</div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="search-terms" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">Search Terms</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
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
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="jobspy" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">JobSpy Scraper</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-6">
              <div className="space-y-3">
                  <div className="text-sm font-medium">Scraped Sites</div>
                  <div className="flex gap-6">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="site-indeed" 
                            checked={jobspySitesDraft?.includes('indeed') ?? defaultJobspySites.includes('indeed')}
                            onCheckedChange={(checked) => {
                                const current = jobspySitesDraft ?? defaultJobspySites
                                let next = [...current]
                                if (checked) {
                                    if (!next.includes('indeed')) next.push('indeed')
                                } else {
                                    next = next.filter(s => s !== 'indeed')
                                }
                                setJobspySitesDraft(next)
                            }}
                            disabled={isLoading || isSaving}
                        />
                        <label htmlFor="site-indeed" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Indeed</label>
                    </div>
                     <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="site-linkedin" 
                            checked={jobspySitesDraft?.includes('linkedin') ?? defaultJobspySites.includes('linkedin')}
                            onCheckedChange={(checked) => {
                                const current = jobspySitesDraft ?? defaultJobspySites
                                let next = [...current]
                                if (checked) {
                                    if (!next.includes('linkedin')) next.push('linkedin')
                                } else {
                                    next = next.filter(s => s !== 'linkedin')
                                }
                                setJobspySitesDraft(next)
                            }}
                            disabled={isLoading || isSaving}
                        />
                        <label htmlFor="site-linkedin" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">LinkedIn</label>
                    </div>
                  </div>
                   <div className="text-xs text-muted-foreground">
                    Select which sites JobSpy should scrape.
                  </div>
                   <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Effective: {(effectiveJobspySites || []).join(', ') || "None"}</span>
                    <span>Default: {(defaultJobspySites || []).join(', ')}</span>
                  </div>
              </div>

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
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="resume-projects" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <span className="text-base font-semibold">Resume Projects</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
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
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="danger-zone" className="border rounded-lg px-4 border-destructive/30 mt-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-base font-semibold tracking-wider">Danger Zone</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-md space-y-4">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-destructive">Clear Jobs by Status</div>
                  <div className="text-xs text-muted-foreground">
                    Select which job statuses you want to clear.
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_JOB_STATUSES.map((status) => {
                    const isSelected = statusesToClear.includes(status)
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => toggleStatusToClear(status)}
                        disabled={isLoading || isSaving}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected ? 'border-destructive bg-destructive/10' : 'border-border'
                        }`}
                      >
                        <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-destructive' : 'border-muted-foreground'
                        }`}>
                          {isSelected && <div className="h-2 w-2 rounded-full bg-destructive" />}
                        </div>
                        <div className="grid gap-0.5">
                          <span className="text-sm font-medium capitalize">{status}</span>
                          <span className="text-xs text-muted-foreground">
                            {STATUS_DESCRIPTIONS[status]}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      disabled={isLoading || isSaving || statusesToClear.length === 0}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear Selected ({statusesToClear.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear jobs by status?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all jobs with the following statuses: {statusesToClear.join(', ')}.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearByStatuses} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Clear {statusesToClear.length} status{statusesToClear.length !== 1 ? 'es' : ''}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <Separator />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-3 rounded-md">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-destructive">Clear Entire Database</div>
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={isLoading || isSaving || !canSave}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isLoading || isSaving || !settings}>
          Reset to default
        </Button>
      </div>
    </main>
    </>
  )
}
