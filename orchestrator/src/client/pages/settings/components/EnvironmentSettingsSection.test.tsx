import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { Accordion } from "@/components/ui/accordion";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";

const EnvironmentSettingsHarness = () => {
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      ukvisajobsEmail: "visa@example.com",
      basicAuthUser: "admin",
      ukvisajobsPassword: "",
      adzunaAppId: "adzuna-id",
      adzunaAppKey: "",
      basicAuthPassword: "super-secret",
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
              ukvisajobsEmail: "visa@example.com",
              adzunaAppId: "adzuna-id",
              basicAuthUser: "admin",
              basicAuthPassword: "super-secret",
            },
            private: {
              ukvisajobsPasswordHint: "pass",
              adzunaAppKeyHint: "adzu",
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

    expect(screen.getByDisplayValue("visa@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("adzuna-id")).toBeInTheDocument();

    expect(screen.getByText(/pass\*{8}/)).toBeInTheDocument();
    expect(screen.getByText(/adzu\*{8}/)).toBeInTheDocument();
    // Authentication
    expect(screen.getByLabelText("Enable authentication")).toBeChecked();
    expect(screen.getByDisplayValue("admin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("super-secret")).toBeInTheDocument();

    // Sections
    expect(screen.getByText("Service Accounts")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("RxResume")).not.toBeInTheDocument();
  });
});
