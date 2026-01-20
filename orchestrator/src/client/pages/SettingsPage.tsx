/**
 * Settings page.
 */

import React, { useEffect, useMemo, useState } from "react"
import { Settings } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "../components/layout"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import type { AppSettings, JobStatus, ResumeProjectsSettings } from "../../shared/types"
import * as api from "../api"
import { arraysEqual } from "@/lib/utils"
import { resumeProjectsEqual } from "./settings/utils"
import { DangerZoneSection } from "./settings/components/DangerZoneSection"
import { GradcrackerSection } from "./settings/components/GradcrackerSection"
import { JobCompleteWebhookSection } from "./settings/components/JobCompleteWebhookSection"
import { JobspySection } from "./settings/components/JobspySection"
import { ModelSettingsSection } from "./settings/components/ModelSettingsSection"
import { PipelineWebhookSection } from "./settings/components/PipelineWebhookSection"
import { ResumeProjectsSection } from "./settings/components/ResumeProjectsSection"
import { SearchTermsSection } from "./settings/components/SearchTermsSection"
import { UkvisajobsSection } from "./settings/components/UkvisajobsSection"

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
          description: `Deleted ${totalDeleted} jobs: ${results.join(', ')}`,
        })
      } else {
        toast.info("No jobs found", {
          description: `No jobs with selected statuses found`,
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
      />

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12">
        <Accordion type="multiple" className="w-full space-y-4">
          <ModelSettingsSection
            modelDraft={modelDraft}
            setModelDraft={setModelDraft}
            modelScorerDraft={modelScorerDraft}
            setModelScorerDraft={setModelScorerDraft}
            modelTailoringDraft={modelTailoringDraft}
            setModelTailoringDraft={setModelTailoringDraft}
            modelProjectSelectionDraft={modelProjectSelectionDraft}
            setModelProjectSelectionDraft={setModelProjectSelectionDraft}
            effectiveModel={effectiveModel}
            effectiveModelScorer={effectiveModelScorer}
            effectiveModelTailoring={effectiveModelTailoring}
            effectiveModelProjectSelection={effectiveModelProjectSelection}
            defaultModel={defaultModel}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <PipelineWebhookSection
            pipelineWebhookUrlDraft={pipelineWebhookUrlDraft}
            setPipelineWebhookUrlDraft={setPipelineWebhookUrlDraft}
            defaultPipelineWebhookUrl={defaultPipelineWebhookUrl}
            effectivePipelineWebhookUrl={effectivePipelineWebhookUrl}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <JobCompleteWebhookSection
            jobCompleteWebhookUrlDraft={jobCompleteWebhookUrlDraft}
            setJobCompleteWebhookUrlDraft={setJobCompleteWebhookUrlDraft}
            defaultJobCompleteWebhookUrl={defaultJobCompleteWebhookUrl}
            effectiveJobCompleteWebhookUrl={effectiveJobCompleteWebhookUrl}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <UkvisajobsSection
            ukvisajobsMaxJobsDraft={ukvisajobsMaxJobsDraft}
            setUkvisajobsMaxJobsDraft={setUkvisajobsMaxJobsDraft}
            defaultUkvisajobsMaxJobs={defaultUkvisajobsMaxJobs}
            effectiveUkvisajobsMaxJobs={effectiveUkvisajobsMaxJobs}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <GradcrackerSection
            gradcrackerMaxJobsPerTermDraft={gradcrackerMaxJobsPerTermDraft}
            setGradcrackerMaxJobsPerTermDraft={setGradcrackerMaxJobsPerTermDraft}
            defaultGradcrackerMaxJobsPerTerm={defaultGradcrackerMaxJobsPerTerm}
            effectiveGradcrackerMaxJobsPerTerm={effectiveGradcrackerMaxJobsPerTerm}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <SearchTermsSection
            searchTermsDraft={searchTermsDraft}
            setSearchTermsDraft={setSearchTermsDraft}
            defaultSearchTerms={defaultSearchTerms}
            effectiveSearchTerms={effectiveSearchTerms}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <JobspySection
            jobspySitesDraft={jobspySitesDraft}
            setJobspySitesDraft={setJobspySitesDraft}
            defaultJobspySites={defaultJobspySites}
            effectiveJobspySites={effectiveJobspySites}
            jobspyLocationDraft={jobspyLocationDraft}
            setJobspyLocationDraft={setJobspyLocationDraft}
            defaultJobspyLocation={defaultJobspyLocation}
            effectiveJobspyLocation={effectiveJobspyLocation}
            jobspyResultsWantedDraft={jobspyResultsWantedDraft}
            setJobspyResultsWantedDraft={setJobspyResultsWantedDraft}
            defaultJobspyResultsWanted={defaultJobspyResultsWanted}
            effectiveJobspyResultsWanted={effectiveJobspyResultsWanted}
            jobspyHoursOldDraft={jobspyHoursOldDraft}
            setJobspyHoursOldDraft={setJobspyHoursOldDraft}
            defaultJobspyHoursOld={defaultJobspyHoursOld}
            effectiveJobspyHoursOld={effectiveJobspyHoursOld}
            jobspyCountryIndeedDraft={jobspyCountryIndeedDraft}
            setJobspyCountryIndeedDraft={setJobspyCountryIndeedDraft}
            defaultJobspyCountryIndeed={defaultJobspyCountryIndeed}
            effectiveJobspyCountryIndeed={effectiveJobspyCountryIndeed}
            jobspyLinkedinFetchDescriptionDraft={jobspyLinkedinFetchDescriptionDraft}
            setJobspyLinkedinFetchDescriptionDraft={setJobspyLinkedinFetchDescriptionDraft}
            defaultJobspyLinkedinFetchDescription={defaultJobspyLinkedinFetchDescription}
            effectiveJobspyLinkedinFetchDescription={effectiveJobspyLinkedinFetchDescription}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <ResumeProjectsSection
            resumeProjectsDraft={resumeProjectsDraft}
            setResumeProjectsDraft={setResumeProjectsDraft}
            profileProjects={profileProjects}
            lockedCount={lockedCount}
            maxProjectsTotal={maxProjectsTotal}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <DangerZoneSection
            statusesToClear={statusesToClear}
            toggleStatusToClear={toggleStatusToClear}
            handleClearByStatuses={handleClearByStatuses}
            handleClearDatabase={handleClearDatabase}
            isLoading={isLoading}
            isSaving={isSaving}
          />
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
