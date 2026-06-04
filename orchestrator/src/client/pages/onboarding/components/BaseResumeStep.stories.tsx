import type { Story } from "@ladle/react";
import { BaseResumeStep } from "./BaseResumeStep";

const baseProps = {
  baseResumeValidation: {
    checked: false,
    hydrated: true,
    valid: false,
    message: null,
  },
  baseResumeValue: null,
  hasRxResumeAccess: false,
  importingResumeFileName: "Manal_Aamir_BlueVoyant (1).pdf",
  isBusy: true,
  isImportingResume: true,
  isResumeReady: false,
  isRxResumeSelfHosted: false,
  resumeSetupMode: "upload" as const,
  rxresumeApiKey: "",
  rxresumeApiKeyHint: null,
  rxresumeUrl: "",
  rxresumeValidation: {
    checked: false,
    hydrated: true,
    valid: false,
    message: null,
  },
  onImportResumeFile: async () => {},
  onResumeSetupModeChange: () => {},
  onRxresumeApiKeyChange: () => {},
  onRxresumeSelfHostedChange: () => {},
  onRxresumeUrlChange: () => {},
  onTemplateResumeChange: () => {},
};

export const ResumeUploadingLoader: Story = () => (
  <main className="min-h-[420px] bg-background p-6 text-foreground">
    <section className="mx-auto max-w-4xl">
      <BaseResumeStep {...baseProps} />
    </section>
  </main>
);

ResumeUploadingLoader.storyName = "Resume uploading loader";
