import type { UpdateSettingsInput } from "@shared/settings-schema";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { Accordion } from "@/components/ui/accordion";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";

const EnvironmentSettingsHarness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      rxresumeEmail: "resume@example.com",
      ukvisajobsEmail: "visa@example.com",
      basicAuthUser: "admin",
      openrouterApiKey: "",
      rxresumePassword: "",
      ukvisajobsPassword: "",
      basicAuthPassword: "",
      webhookSecret: "",
      enableBasicAuth: true,
    },
  });

  return (
    <FormProvider {...methods}>
      <Accordion type="multiple" defaultValue={["environment"]}>
        <EnvironmentSettingsSection
          values={{
            readable: {
              rxresumeEmail: "resume@example.com",
              ukvisajobsEmail: "visa@example.com",
              basicAuthUser: "admin",
            },
            private: {
              openrouterApiKeyHint: "sk-1",
              rxresumePasswordHint: null,
              ukvisajobsPasswordHint: "pass",
              basicAuthPasswordHint: "abcd",
              webhookSecretHint: "sec-",
            },
            basicAuthActive: true,
          }}
          isLoading={false}
          isSaving={false}
        />
      </Accordion>
    </FormProvider>
  );
};

describe("EnvironmentSettingsSection", () => {
  it("renders values grouped logically and masks private secrets with hints", () => {
    render(<EnvironmentSettingsHarness />);

    expect(screen.getByDisplayValue("resume@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("visa@example.com")).toBeInTheDocument();

    expect(screen.getByText(/pass\*{8}/)).toBeInTheDocument();
    expect(screen.getByText(/abcd\*{8}/)).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();

    // Basic Auth
    expect(screen.getByLabelText("Enable basic authentication")).toBeChecked();
    expect(screen.getByDisplayValue("admin")).toBeInTheDocument();

    // Sections
    expect(screen.getByText("Service Accounts")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });
});
