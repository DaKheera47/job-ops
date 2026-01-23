import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import * as api from "@client/api"
import { useSettings } from "@client/hooks/useSettings"
import { SettingsInput } from "@client/pages/settings/components/SettingsInput"
import { formatSecretHint } from "@client/pages/settings/utils"
import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection"
import type { ValidationResult } from "@shared/types"

type ValidationState = ValidationResult & { checked: boolean }

export const OnboardingGate: React.FC = () => {
  const { settings, isLoading: settingsLoading, refreshSettings } = useSettings()
  const [isSavingEnv, setIsSavingEnv] = useState(false)
  const [isValidatingOpenrouter, setIsValidatingOpenrouter] = useState(false)
  const [isValidatingRxresume, setIsValidatingRxresume] = useState(false)
  const [isValidatingBaseResume, setIsValidatingBaseResume] = useState(false)
  const [openrouterValidation, setOpenrouterValidation] = useState<ValidationState>({
    valid: false,
    message: null,
    checked: false,
  })
  const [rxresumeValidation, setRxresumeValidation] = useState<ValidationState>({
    valid: false,
    message: null,
    checked: false,
  })
  const [baseResumeValidation, setBaseResumeValidation] = useState<ValidationState>({
    valid: false,
    message: null,
    checked: false,
  })
  const [currentStep, setCurrentStep] = useState<string | null>(null)

  const [openrouterApiKey, setOpenrouterApiKey] = useState("")
  const [rxresumeEmail, setRxresumeEmail] = useState("")
  const [rxresumePassword, setRxresumePassword] = useState("")
  const [rxresumeBaseResumeId, setRxresumeBaseResumeId] = useState<string | null>(null)

  const validateOpenrouter = useCallback(async (apiKey?: string) => {
    setIsValidatingOpenrouter(true)
    try {
      const result = await api.validateOpenrouter(apiKey)
      setOpenrouterValidation({ ...result, checked: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenRouter validation failed"
      const result = { valid: false, message }
      setOpenrouterValidation({ ...result, checked: true })
      return result
    } finally {
      setIsValidatingOpenrouter(false)
    }
  }, [])

  const validateRxresume = useCallback(async (email?: string, password?: string) => {
    setIsValidatingRxresume(true)
    try {
      const result = await api.validateRxresume(email, password)
      setRxresumeValidation({ ...result, checked: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "RxResume validation failed"
      const result = { valid: false, message }
      setRxresumeValidation({ ...result, checked: true })
      return result
    } finally {
      setIsValidatingRxresume(false)
    }
  }, [])

  const validateBaseResume = useCallback(async () => {
    setIsValidatingBaseResume(true)
    try {
      const result = await api.validateResumeConfig()
      setBaseResumeValidation({ ...result, checked: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "Base resume validation failed"
      const result = { valid: false, message }
      setBaseResumeValidation({ ...result, checked: true })
      return result
    } finally {
      setIsValidatingBaseResume(false)
    }
  }, [])

  const hasOpenrouterKey = Boolean(settings?.openrouterApiKeyHint)
  const hasRxresumeEmail = Boolean(settings?.rxresumeEmail?.trim())
  const hasRxresumePassword = Boolean(settings?.rxresumePasswordHint)
  const shouldOpen = Boolean(settings && !settingsLoading)
    && !(openrouterValidation.valid && rxresumeValidation.valid && baseResumeValidation.valid)

  const openrouterCurrent = settings?.openrouterApiKeyHint
    ? formatSecretHint(settings.openrouterApiKeyHint)
    : undefined
  const rxresumeEmailCurrent = settings?.rxresumeEmail?.trim()
    ? settings.rxresumeEmail
    : undefined
  const rxresumePasswordCurrent = settings?.rxresumePasswordHint
    ? formatSecretHint(settings.rxresumePasswordHint)
    : undefined

  useEffect(() => {
    if (settings) {
      setRxresumeBaseResumeId(settings.rxresumeBaseResumeId || null)
    }
  }, [settings])

  const steps = useMemo(
    () => [
      {
        id: "openrouter",
        label: "Connect AI",
        subtitle: "OpenRouter key",
        complete: openrouterValidation.valid,
        disabled: false,
      },
      {
        id: "rxresume",
        label: "Connect Reactive Resume",
        subtitle: "Reactive Resume login",
        complete: rxresumeValidation.valid,
        disabled: false,
      },
      {
        id: "baseresume",
        label: "Select Template Resume",
        subtitle: "Template selection",
        complete: baseResumeValidation.valid,
        disabled: !rxresumeValidation.valid,
      },
    ],
    [openrouterValidation.valid, rxresumeValidation.valid, baseResumeValidation.valid]
  )

  const defaultStep = steps.find((step) => !step.complete)?.id ?? steps[0]?.id

  useEffect(() => {
    if (!shouldOpen) return
    if (!currentStep && defaultStep) {
      setCurrentStep(defaultStep)
    }
  }, [currentStep, defaultStep, shouldOpen])

  const runAllValidations = useCallback(async () => {
    if (!settings) return
    const results = await Promise.allSettled([
      validateOpenrouter(),
      validateRxresume(),
      validateBaseResume(),
    ])

    const failed = results.find((result) => result.status === "rejected")
    if (failed) {
      const reason = failed.status === "rejected" ? failed.reason : null
      const message = reason instanceof Error ? reason.message : "Validation checks failed"
      toast.error(message)
    }
  }, [settings, validateOpenrouter, validateRxresume, validateBaseResume])

  useEffect(() => {
    if (!settings || settingsLoading) return
    if (openrouterValidation.checked || rxresumeValidation.checked || baseResumeValidation.checked) return
    void runAllValidations()
  }, [settings, settingsLoading, openrouterValidation.checked, rxresumeValidation.checked, baseResumeValidation.checked, runAllValidations])

  const handleRefresh = async () => {
    const results = await Promise.allSettled([refreshSettings(), runAllValidations()])
    const failed = results.find((result) => result.status === "rejected")
    if (failed) {
      const reason = failed.status === "rejected" ? failed.reason : null
      const message = reason instanceof Error ? reason.message : "Failed to refresh setup"
      toast.error(message)
    }
  }

  const handleSaveOpenrouter = async (): Promise<boolean> => {
    const openrouterValue = openrouterApiKey.trim()
    if (!openrouterValue && !hasOpenrouterKey) {
      toast.info("Add your OpenRouter API key to continue")
      return false
    }

    try {
      const validation = await validateOpenrouter(openrouterValue || undefined)
      if (!validation.valid) {
        toast.error(validation.message || "OpenRouter validation failed")
        return false
      }

      if (openrouterValue) {
        setIsSavingEnv(true)
        await api.updateSettings({ openrouterApiKey: openrouterValue })
        await refreshSettings()
        setOpenrouterApiKey("")
      }

      toast.success("OpenRouter connected")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save OpenRouter key"
      toast.error(message)
      return false
    } finally {
      setIsSavingEnv(false)
    }
  }

  const handleSaveRxresume = async (): Promise<boolean> => {
    const emailValue = rxresumeEmail.trim()
    const passwordValue = rxresumePassword.trim()
    const missing: string[] = []

    if (!hasRxresumeEmail && !emailValue) missing.push("RxResume email")
    if (!hasRxresumePassword && !passwordValue) missing.push("RxResume password")

    if (missing.length > 0) {
      toast.info("Almost there", {
        description: `Missing: ${missing.join(", ")}`,
      })
      return false
    }

    try {
      const validation = await validateRxresume(emailValue || undefined, passwordValue || undefined)
      if (!validation.valid) {
        toast.error(validation.message || "RxResume validation failed")
        return false
      }

      const update: { rxresumeEmail?: string; rxresumePassword?: string } = {}
      if (emailValue) update.rxresumeEmail = emailValue
      if (passwordValue) update.rxresumePassword = passwordValue

      if (Object.keys(update).length > 0) {
        setIsSavingEnv(true)
        await api.updateSettings(update)
        await refreshSettings()
        setRxresumePassword("")
      }

      toast.success("RxResume connected")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save RxResume credentials"
      toast.error(message)
      return false
    } finally {
      setIsSavingEnv(false)
    }
  }

  const handleSaveBaseResume = async (): Promise<boolean> => {
    if (!rxresumeBaseResumeId) {
      toast.info("Select a base resume to continue")
      return false
    }

    try {
      setIsSavingEnv(true)
      await api.updateSettings({ rxresumeBaseResumeId: rxresumeBaseResumeId })
      const validation = await validateBaseResume()
      if (!validation.valid) {
        toast.error(validation.message || "Base resume validation failed")
        return false
      }

      await refreshSettings()
      toast.success("Base resume set")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save base resume"
      toast.error(message)
      return false
    } finally {
      setIsSavingEnv(false)
    }
  }

  const resolvedStepIndex = currentStep ? steps.findIndex((step) => step.id === currentStep) : 0
  const stepIndex = resolvedStepIndex >= 0 ? resolvedStepIndex : 0
  const completedSteps = steps.filter((step) => step.complete).length
  const progressValue = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0
  const isBusy = isSavingEnv || settingsLoading || isValidatingOpenrouter || isValidatingRxresume || isValidatingBaseResume
  const canGoBack = stepIndex > 0
  const primaryLabel = currentStep === "openrouter"
    ? (openrouterValidation.valid ? "Revalidate" : "Validate")
    : currentStep === "rxresume"
      ? (rxresumeValidation.valid ? "Revalidate" : "Validate")
      : currentStep === "baseresume"
        ? (baseResumeValidation.valid ? "Revalidate" : "Validate")
        : "Validate"

  const handlePrimaryAction = async () => {
    if (!currentStep) return
    if (currentStep === "openrouter") {
      await handleSaveOpenrouter()
      return
    }
    if (currentStep === "rxresume") {
      await handleSaveRxresume()
      return
    }
    if (currentStep === "baseresume") {
      await handleSaveBaseResume()
      return
    }
  }

  const handleBack = () => {
    if (!canGoBack) return
    setCurrentStep(steps[stepIndex - 1]?.id ?? currentStep)
  }

  if (!shouldOpen || !currentStep) return null

  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="space-y-6 px-6 py-6 max-h-[calc(90vh-3.5rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Welcome to Job Ops</AlertDialogTitle>
            <AlertDialogDescription>
              Let’s get your workspace ready. Add your keys and resume once, then the pipeline can run end-to-end.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Tabs value={currentStep} onValueChange={setCurrentStep}>
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 border-b border-border/60 bg-transparent p-0 text-left sm:grid-cols-3">
              {steps.map((step, index) => {
                const isActive = step.id === currentStep
                const isComplete = step.complete

                return (
                  <FieldLabel
                    key={step.id}
                    className={cn(
                      "w-full [&>[data-slot=field]]:border-0 [&>[data-slot=field]]:p-0 [&>[data-slot=field]]:rounded-none",
                      step.disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <TabsTrigger
                      value={step.id}
                      disabled={step.disabled}
                      className={cn(
                        "w-full rounded-md hover:bg-muted/60 border-b-2 border-transparent px-3 py-4 text-left shadow-none",
                        isActive ? "border-primary !bg-muted/60 text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <Field orientation="horizontal" className="items-start">
                        <FieldContent>
                          <FieldTitle>{step.label}</FieldTitle>
                          <FieldDescription>{step.subtitle}</FieldDescription>
                        </FieldContent>
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold",
                            isComplete
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                      </Field>
                    </TabsTrigger>
                  </FieldLabel>
                )
              })}
            </TabsList>

            <TabsContent value="openrouter" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Connect OpenRouter</p>
                <p className="text-xs text-muted-foreground">Used for job scoring, summaries, and tailoring.</p>
              </div>
              <SettingsInput
                label="OpenRouter API key"
                inputProps={{
                  name: "openrouterApiKey",
                  value: openrouterApiKey,
                  onChange: (event) => setOpenrouterApiKey(event.target.value),
                }}
                type="password"
                placeholder="sk-or-v1..."
                current={openrouterCurrent}
                helper="Create a key at openrouter.ai"
                disabled={isSavingEnv}
              />
            </TabsContent>

            <TabsContent value="rxresume" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Link your RxResume account</p>
                <p className="text-xs text-muted-foreground">Used to export tailored PDFs.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsInput
                  label="Email"
                  inputProps={{
                    name: "rxresumeEmail",
                    value: rxresumeEmail,
                    onChange: (event) => setRxresumeEmail(event.target.value),
                  }}
                  placeholder="you@example.com"
                  current={rxresumeEmailCurrent}
                  disabled={isSavingEnv}
                />
                <SettingsInput
                  label="Password"
                  inputProps={{
                    name: "rxresumePassword",
                    value: rxresumePassword,
                    onChange: (event) => setRxresumePassword(event.target.value),
                  }}
                  type="password"
                  placeholder="Enter password"
                  current={rxresumePasswordCurrent}
                  disabled={isSavingEnv}
                />
              </div>
            </TabsContent>

            <TabsContent value="baseresume" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Select your template resume</p>
                <p className="text-xs text-muted-foreground">Choose the resume you want to use as a template.
                  The selected resume will be used as a template for tailoring.
                </p>
              </div>
              <BaseResumeSelection
                value={rxresumeBaseResumeId}
                onValueChange={setRxresumeBaseResumeId}
                hasRxResumeAccess={rxresumeValidation.valid}
                disabled={isSavingEnv}
              />
            </TabsContent>

          </Tabs>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleBack} disabled={!canGoBack || isBusy}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleRefresh} disabled={isBusy}>
                Refresh status
              </Button>
              <Button onClick={handlePrimaryAction} disabled={isBusy}>
                {isBusy ? "Working..." : primaryLabel}
              </Button>
            </div>
          </div>

          <Progress value={progressValue} className="h-2" />

          <div className="rounded-lg border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            Friendly heads-up: pipelines can be slow or a little flaky in alpha. If anything feels off, open a GitHub issue and
            we will take a look.{" "}
            <a
              className="font-semibold text-foreground underline underline-offset-2"
              href="https://github.com/DaKheera47/job-ops/issues"
              target="_blank"
              rel="noreferrer"
            >
              Open an issue
            </a>
            .
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
