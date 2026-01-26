import type { SearchTermsValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

type SearchTermsSectionProps = {
  values: SearchTermsValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const SearchTermsSection: React.FC<SearchTermsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const { default: defaultSearchTerms, effective: effectiveSearchTerms } =
    values;
  const {
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="search-terms" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Search Terms</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Global search terms</div>
            <Controller
              name="searchTerms"
              control={control}
              render={({ field }) => (
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={
                    field.value
                      ? field.value.join("\n")
                      : (defaultSearchTerms ?? []).join("\n")
                  }
                  onChange={(event) => {
                    const text = event.target.value;
                    const terms = text.split("\n");
                    field.onChange(terms);
                  }}
                  onBlur={() => {
                    if (field.value) {
                      field.onChange(
                        field.value.map((t) => t.trim()).filter(Boolean),
                      );
                    }
                  }}
                  placeholder="e.g. web developer"
                  disabled={isLoading || isSaving}
                  rows={5}
                />
              )}
            />
            {errors.searchTerms && (
              <p className="text-xs text-destructive">
                {errors.searchTerms.message}
              </p>
            )}
            <div className="text-xs text-muted-foreground">
              One term per line. Applies to UKVisaJobs and other supported
              extractors.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">
                {(effectiveSearchTerms || []).join(", ") || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">
                {(defaultSearchTerms || []).join(", ") || "—"}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
