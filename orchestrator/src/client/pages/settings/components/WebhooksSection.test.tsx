import type { UpdateSettingsInput } from "@shared/settings-schema";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { Accordion } from "@/components/ui/accordion";
import { WebhooksSection } from "./WebhooksSection";

const WebhooksHarness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      pipelineWebhookUrl: "https://pipeline.com",
      jobCompleteWebhookUrl: "https://job.com",
      webhookSecret: "",
    },
  });

  return (
    <FormProvider {...methods}>
      <Accordion type="multiple" defaultValue={["webhooks"]}>
        <WebhooksSection
          pipelineWebhook={{
            default: "https://default-p.com",
            effective: "https://pipeline.com",
          }}
          jobCompleteWebhook={{
            default: "https://default-j.com",
            effective: "https://job.com",
          }}
          webhookSecretHint="sec-"
          isLoading={false}
          isSaving={false}
        />
      </Accordion>
    </FormProvider>
  );
};

describe("WebhooksSection", () => {
  it("renders both webhook sections and the secret", () => {
    render(<WebhooksHarness />);

    expect(screen.getByText("Pipeline Status")).toBeInTheDocument();
    expect(screen.getByText("Job Completion")).toBeInTheDocument();

    expect(
      screen.getByDisplayValue("https://pipeline.com"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://job.com")).toBeInTheDocument();

    expect(screen.getByText("sec-********")).toBeInTheDocument();
  });
});
