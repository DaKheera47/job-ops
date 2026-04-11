import type React from "react";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { BasicAuthChoice } from "../types";

export const BasicAuthStep: React.FC<{
  basicAuthChoice: BasicAuthChoice;
  basicAuthPassword: string;
  basicAuthUser: string;
  isBusy: boolean;
  onBasicAuthChoiceChange: (choice: BasicAuthChoice) => void;
  onBasicAuthPasswordChange: (value: string) => void;
  onBasicAuthUserChange: (value: string) => void;
}> = ({
  basicAuthChoice,
  basicAuthPassword,
  basicAuthUser,
  isBusy,
  onBasicAuthChoiceChange,
  onBasicAuthPasswordChange,
  onBasicAuthUserChange,
}) => (
  <div className="space-y-6">
    <RadioGroup
      value={basicAuthChoice ?? ""}
      onValueChange={(value) =>
        onBasicAuthChoiceChange(
          value === "enable" || value === "skip" ? value : null,
        )
      }
      className="grid gap-4 lg:grid-cols-2"
    >
      {[
        {
          value: "enable",
          title: "Enable basic auth",
          description:
            "Require a username and password before write actions run in this workspace.",
        },
        {
          value: "skip",
          title: "Skip for now",
          description:
            "Finish onboarding now and come back in Settings if you decide to lock the app down later.",
        },
      ].map((option) => {
        const checked = basicAuthChoice === option.value;
        const radioId = `basic-auth-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={radioId}
            className={cn(
              "flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors",
              checked
                ? "border-primary bg-muted/40"
                : "border-border/60 hover:bg-muted/20",
            )}
          >
            <RadioGroupItem
              id={radioId}
              value={option.value}
              className="mt-1"
            />
            <div className="space-y-1">
              <div className="text-base font-medium text-foreground">
                {option.title}
              </div>
              <div className="text-sm leading-6 text-muted-foreground">
                {option.description}
              </div>
            </div>
          </label>
        );
      })}
    </RadioGroup>

    {basicAuthChoice === "enable" && (
      <div className="grid gap-5 rounded-lg border border-border/60 bg-muted/20 p-5 lg:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="basicAuthUser" className="text-sm font-medium">
            Username
          </label>
          <Input
            id="basicAuthUser"
            value={basicAuthUser}
            onChange={(event) =>
              onBasicAuthUserChange(event.currentTarget.value)
            }
            placeholder="jobops-admin"
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="basicAuthPassword" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="basicAuthPassword"
            type="password"
            value={basicAuthPassword}
            onChange={(event) =>
              onBasicAuthPasswordChange(event.currentTarget.value)
            }
            placeholder="Create a strong password"
            disabled={isBusy}
          />
        </div>
      </div>
    )}
  </div>
);
