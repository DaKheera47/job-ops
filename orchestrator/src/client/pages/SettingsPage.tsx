import React, { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { toast } from "sonner"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { PageHeader } from "@client/components/layout"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import type { AppSettings, JobStatus } from "@shared/types"
import { updateSettingsSchema, type UpdateSettingsInput } from "@shared/settings-schema"
import * as api from "@client/api"
import { arraysEqual } from "@/lib/utils"
import { resumeProjectsEqual } from "@client/pages/settings/utils"
import { DangerZoneSection } from "@client/pages/settings/components/DangerZoneSection"
import { DisplaySettingsSection } from "@client/pages/settings/components/DisplaySettingsSection"
import { GradcrackerSection } from "@client/pages/settings/components/GradcrackerSection"
import { JobCompleteWebhookSection } from "@client/pages/settings/components/JobCompleteWebhookSection"
import { JobspySection } from "@client/pages/settings/components/JobspySection"
import { ModelSettingsSection } from "@client/pages/settings/components/ModelSettingsSection"
import { PipelineWebhookSection } from "@client/pages/settings/components/PipelineWebhookSection"
import { ResumeProjectsSection } from "@client/pages/settings/components/ResumeProjectsSection"
import { SearchTermsSection } from "@client/pages/settings/components/SearchTermsSection"
import { UkvisajobsSection } from "@client/pages/settings/components/UkvisajobsSection"

const DEFAULT_FORM_VALUES: UpdateSettingsInput = {
  model: "",
  modelScorer: "",
  modelTailoring: "",
  modelProjectSelection: "",
  pipelineWebhookUrl: "",
  jobCompleteWebhookUrl: "",
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
  showSponsorInfo: null,
}

const NULL_SETTINGS_PAYLOAD: UpdateSettingsInput = {
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
  showSponsorInfo: null,
}

const mapSettingsToForm = (data: AppSettings): UpdateSettingsInput => ({
  model: data.overrideModel ?? "",
  modelScorer: data.overrideModelScorer ?? "",
  modelTailoring: data.overrideModelTailoring ?? "",
  modelProjectSelection: data.overrideModelProjectSelection ?? "",
  pipelineWebhookUrl: data.overridePipelineWebhookUrl ?? "",
  jobCompleteWebhookUrl: data.overrideJobCompleteWebhookUrl ?? "",
  resumeProjects: data.resumeProjects,
  ukvisajobsMaxJobs: data.overrideUkvisajobsMaxJobs,
  gradcrackerMaxJobsPerTerm: data.overrideGradcrackerMaxJobsPerTerm,
  searchTerms: data.overrideSearchTerms,
  jobspyLocation: data.overrideJobspyLocation,
  jobspyResultsWanted: data.overrideJobspyResultsWanted,
  jobspyHoursOld: data.overrideJobspyHoursOld,
  jobspyCountryIndeed: data.overrideJobspyCountryIndeed,
  jobspySites: data.overrideJobspySites,
  jobspyLinkedinFetchDescription: data.overrideJobspyLinkedinFetchDescription,
  showSponsorInfo: data.overrideShowSponsorInfo,
})

const normalizeString = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const isSameStringList = (left: string[] | null | undefined, right: string[] | null | undefined) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return arraysEqual(left, right)
}

const isSameSortedStringList = (left: string[] | null | undefined, right: string[] | null | undefined) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return arraysEqual(left.slice().sort(), right.slice().sort())
}

const nullIfSame = <T,>(value: T | null | undefined, defaultValue: T) =>
  value === defaultValue ? null : value ?? null

const nullIfSameList = (value: string[] | null | undefined, defaultValue: string[]) =>
  isSameStringList(value, defaultValue) ? null : value ?? null

const nullIfSameSortedList = (value: string[] | null | undefined, defaultValue: string[]) =>
  isSameSortedStringList(value, defaultValue) ? null : value ?? null

const getDerivedSettings = (settings: AppSettings | null) => {
  const profileProjects = settings?.profileProjects ?? []

  return {
    model: {
      effective: settings?.model ?? "",
      default: settings?.defaultModel ?? "",
      scorer: settings?.modelScorer ?? "",
      tailoring: settings?.modelTailoring ?? "",
      projectSelection: settings?.modelProjectSelection ?? "",
    },
    pipelineWebhook: {
      effective: settings?.pipelineWebhookUrl ?? "",
      default: settings?.defaultPipelineWebhookUrl ?? "",
    },
    jobCompleteWebhook: {
      effective: settings?.jobCompleteWebhookUrl ?? "",
      default: settings?.defaultJobCompleteWebhookUrl ?? "",
    },
    ukvisajobs: {
      effectiveMaxJobs: settings?.ukvisajobsMaxJobs ?? 50,
      defaultMaxJobs: settings?.defaultUkvisajobsMaxJobs ?? 50,
    },
    gradcracker: {
      effectiveMaxJobsPerTerm: settings?.gradcrackerMaxJobsPerTerm ?? 50,
      defaultMaxJobsPerTerm: settings?.defaultGradcrackerMaxJobsPerTerm ?? 50,
    },
    searchTerms: {
      effective: settings?.searchTerms ?? [],
      default: settings?.defaultSearchTerms ?? [],
    },
    jobspy: {
      location: {
        effective: settings?.jobspyLocation ?? "",
        default: settings?.defaultJobspyLocation ?? "",
      },
      resultsWanted: {
        effective: settings?.jobspyResultsWanted ?? 200,
        default: settings?.defaultJobspyResultsWanted ?? 200,
      },
      hoursOld: {
        effective: settings?.jobspyHoursOld ?? 72,
        default: settings?.defaultJobspyHoursOld ?? 72,
      },
      countryIndeed: {
        effective: settings?.jobspyCountryIndeed ?? "",
        default: settings?.defaultJobspyCountryIndeed ?? "",
      },
      sites: {
        effective: settings?.jobspySites ?? ["indeed", "linkedin"],
        default: settings?.defaultJobspySites ?? ["indeed", "linkedin"],
      },
      linkedinFetchDescription: {
        effective: settings?.jobspyLinkedinFetchDescription ?? true,
        default: settings?.defaultJobspyLinkedinFetchDescription ?? true,
      },
    },
    display: {
      effectiveShowSponsorInfo: settings?.showSponsorInfo ?? true,
      defaultShowSponsorInfo: settings?.defaultShowSponsorInfo ?? true,
    },
    defaultResumeProjects: settings?.defaultResumeProjects ?? null,
    profileProjects,
    maxProjectsTotal: profileProjects.length,
  }
}

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [statusesToClear, setStatusesToClear] = useState<JobStatus[]>(['discovered'])

  const methods = useForm<UpdateSettingsInput>({
    resolver: zodResolver(updateSettingsSchema),
    mode: "onChange",
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const { handleSubmit, reset, watch, formState: { isDirty, errors, isValid } } = methods

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    api
      .getSettings()
      .then((data) => {
        if (!isMounted) return
        setSettings(data)
        reset(mapSettingsToForm(data))
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
  }, [reset])

  const derived = getDerivedSettings(settings)
  const {
    model,
    pipelineWebhook,
    jobCompleteWebhook,
    ukvisajobs,
    gradcracker,
    searchTerms,
    jobspy,
    display,
    defaultResumeProjects,
    profileProjects,
    maxProjectsTotal,
  } = derived

  const watchedValues = watch()
  const lockedCount = watchedValues.resumeProjects?.lockedProjectIds.length ?? 0

  const canSave = isDirty && isValid

  const onSave = async (data: UpdateSettingsInput) => {
    if (!settings) return
    try {
      setIsSaving(true)
      
      // Prepare payload: nullify if equal to default
      const resumeProjectsData = data.resumeProjects
      const resumeProjectsOverride = (resumeProjectsData && defaultResumeProjects && resumeProjectsEqual(resumeProjectsData, defaultResumeProjects))
        ? null
        : resumeProjectsData

      const payload: UpdateSettingsInput = {
        model: normalizeString(data.model),
        modelScorer: normalizeString(data.modelScorer),
        modelTailoring: normalizeString(data.modelTailoring),
        modelProjectSelection: normalizeString(data.modelProjectSelection),
        pipelineWebhookUrl: normalizeString(data.pipelineWebhookUrl),
        jobCompleteWebhookUrl: normalizeString(data.jobCompleteWebhookUrl),
        resumeProjects: resumeProjectsOverride,
        ukvisajobsMaxJobs: nullIfSame(data.ukvisajobsMaxJobs, ukvisajobs.defaultMaxJobs),
        gradcrackerMaxJobsPerTerm: nullIfSame(data.gradcrackerMaxJobsPerTerm, gradcracker.defaultMaxJobsPerTerm),
        searchTerms: nullIfSameList(data.searchTerms, searchTerms.default),
        jobspyLocation: nullIfSame(data.jobspyLocation, jobspy.location.default),
        jobspyResultsWanted: nullIfSame(data.jobspyResultsWanted, jobspy.resultsWanted.default),
        jobspyHoursOld: nullIfSame(data.jobspyHoursOld, jobspy.hoursOld.default),
        jobspyCountryIndeed: nullIfSame(data.jobspyCountryIndeed, jobspy.countryIndeed.default),
        jobspySites: nullIfSameSortedList(data.jobspySites, jobspy.sites.default),
        jobspyLinkedinFetchDescription: nullIfSame(
          data.jobspyLinkedinFetchDescription,
          jobspy.linkedinFetchDescription.default
        ),
        showSponsorInfo: nullIfSame(data.showSponsorInfo, display.defaultShowSponsorInfo),
      }

      const updated = await api.updateSettings(payload)
      setSettings(updated)
      reset(mapSettingsToForm(updated))
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
      const updated = await api.updateSettings(NULL_SETTINGS_PAYLOAD)
      setSettings(updated)
      reset(mapSettingsToForm(updated))
      toast.success("Reset to default")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset settings"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <FormProvider {...methods}>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure runtime behavior for this app."
      />

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12">
        <Accordion type="multiple" className="w-full space-y-4">
          <ModelSettingsSection
            effectiveModel={model.effective}
            effectiveModelScorer={model.scorer}
            effectiveModelTailoring={model.tailoring}
            effectiveModelProjectSelection={model.projectSelection}
            defaultModel={model.default}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <PipelineWebhookSection
            defaultPipelineWebhookUrl={pipelineWebhook.default}
            effectivePipelineWebhookUrl={pipelineWebhook.effective}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <JobCompleteWebhookSection
            defaultJobCompleteWebhookUrl={jobCompleteWebhook.default}
            effectiveJobCompleteWebhookUrl={jobCompleteWebhook.effective}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <UkvisajobsSection
            defaultUkvisajobsMaxJobs={ukvisajobs.defaultMaxJobs}
            effectiveUkvisajobsMaxJobs={ukvisajobs.effectiveMaxJobs}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <GradcrackerSection
            defaultGradcrackerMaxJobsPerTerm={gradcracker.defaultMaxJobsPerTerm}
            effectiveGradcrackerMaxJobsPerTerm={gradcracker.effectiveMaxJobsPerTerm}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <SearchTermsSection
            defaultSearchTerms={searchTerms.default}
            effectiveSearchTerms={searchTerms.effective}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <JobspySection
            defaultJobspySites={jobspy.sites.default}
            effectiveJobspySites={jobspy.sites.effective}
            defaultJobspyLocation={jobspy.location.default}
            effectiveJobspyLocation={jobspy.location.effective}
            defaultJobspyResultsWanted={jobspy.resultsWanted.default}
            effectiveJobspyResultsWanted={jobspy.resultsWanted.effective}
            defaultJobspyHoursOld={jobspy.hoursOld.default}
            effectiveJobspyHoursOld={jobspy.hoursOld.effective}
            defaultJobspyCountryIndeed={jobspy.countryIndeed.default}
            effectiveJobspyCountryIndeed={jobspy.countryIndeed.effective}
            defaultJobspyLinkedinFetchDescription={jobspy.linkedinFetchDescription.default}
            effectiveJobspyLinkedinFetchDescription={jobspy.linkedinFetchDescription.effective}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <ResumeProjectsSection
            profileProjects={profileProjects}
            lockedCount={lockedCount}
            maxProjectsTotal={maxProjectsTotal}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <DisplaySettingsSection
            defaultShowSponsorInfo={display.defaultShowSponsorInfo}
            effectiveShowSponsorInfo={display.effectiveShowSponsorInfo}
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
          <Button onClick={handleSubmit(onSave)} disabled={isLoading || isSaving || !canSave}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isLoading || isSaving || !settings}>
            Reset to default
          </Button>
        </div>
        {Object.keys(errors).length > 0 && (
          <div className="text-destructive text-sm mt-2">
            Please fix the errors before saving.
          </div>
        )}
      </main>
    </FormProvider>
  )
}
