import type {
  LocationInputMode,
  LocationMatchStrictness,
  LocationSearchScope,
} from "@shared/location-preferences.js";
import { formatCountryLabel } from "@shared/location-support.js";
import type { LocationProximity } from "@shared/types";
import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  AutomaticChoiceCardGroup,
  AutomaticMultiChoiceCardGroup,
} from "./AutomaticChoiceCardGroup";
import {
  type AutomaticPresetId,
  type AutomaticPresetSelection,
  type AutomaticRunValues,
  MATCH_STRICTNESS_OPTIONS,
  parseCityLocationsInput,
  SEARCH_SCOPE_OPTIONS,
  WORKPLACE_TYPE_OPTIONS,
  type WorkplaceType,
} from "./automatic-run";
import { LocationRadiusPicker } from "./LocationRadiusPicker";
import { TokenizedInput } from "./TokenizedInput";

interface AutomaticRunSettingsCardProps {
  values: AutomaticRunValues;
  countryOptions: Array<{ value: string; label: string }>;
  countrySuggestion: string | null;
  countrySelectionInvalid: boolean;
  cityLocationDraft: string;
  workplaceTypes: WorkplaceType[];
  workplaceTypeSelectionInvalid: boolean;
  onCountryChange: (country: string) => void;
  onUseCountrySuggestion: () => void;
  onCityLocationDraftChange: (value: string) => void;
  onCityLocationsChange: (value: string[]) => void;
  onLocationModeChange: (value: LocationInputMode) => void;
  onProximityChange: (value: LocationProximity) => void;
  onSearchScopeChange: (value: LocationSearchScope) => void;
  onMatchStrictnessChange: (value: LocationMatchStrictness) => void;
  onToggleWorkplaceType: (
    workplaceType: WorkplaceType,
    checked: boolean,
  ) => void;
}

export function AutomaticRunSettingsCard({
  values,
  countryOptions,
  countrySuggestion,
  countrySelectionInvalid,
  cityLocationDraft,
  workplaceTypes,
  workplaceTypeSelectionInvalid,
  onCountryChange,
  onUseCountrySuggestion,
  onCityLocationDraftChange,
  onCityLocationsChange,
  onLocationModeChange,
  onProximityChange,
  onSearchScopeChange,
  onMatchStrictnessChange,
  onToggleWorkplaceType,
}: AutomaticRunSettingsCardProps) {
  return (
    <LocationPreferences
      values={values}
      countryOptions={countryOptions}
      countrySuggestion={countrySuggestion}
      countrySelectionInvalid={countrySelectionInvalid}
      cityLocationDraft={cityLocationDraft}
      workplaceTypes={workplaceTypes}
      workplaceTypeSelectionInvalid={workplaceTypeSelectionInvalid}
      onCountryChange={onCountryChange}
      onUseCountrySuggestion={onUseCountrySuggestion}
      onCityLocationDraftChange={onCityLocationDraftChange}
      onCityLocationsChange={onCityLocationsChange}
      onLocationModeChange={onLocationModeChange}
      onProximityChange={onProximityChange}
      onSearchScopeChange={onSearchScopeChange}
      onMatchStrictnessChange={onMatchStrictnessChange}
      onToggleWorkplaceType={onToggleWorkplaceType}
    />
  );
}

interface LocationPreferencesProps {
  values: AutomaticRunValues;
  countryOptions: Array<{ value: string; label: string }>;
  countrySuggestion: string | null;
  countrySelectionInvalid: boolean;
  cityLocationDraft: string;
  workplaceTypes: WorkplaceType[];
  workplaceTypeSelectionInvalid: boolean;
  onCountryChange: (country: string) => void;
  onUseCountrySuggestion: () => void;
  onCityLocationDraftChange: (value: string) => void;
  onCityLocationsChange: (value: string[]) => void;
  onLocationModeChange: (value: LocationInputMode) => void;
  onProximityChange: (value: LocationProximity) => void;
  onSearchScopeChange: (value: LocationSearchScope) => void;
  onMatchStrictnessChange: (value: LocationMatchStrictness) => void;
  onToggleWorkplaceType: (
    workplaceType: WorkplaceType,
    checked: boolean,
  ) => void;
}

function LocationPreferences({
  values,
  countryOptions,
  countrySuggestion,
  countrySelectionInvalid,
  cityLocationDraft,
  workplaceTypes,
  workplaceTypeSelectionInvalid,
  onCountryChange,
  onUseCountrySuggestion,
  onCityLocationDraftChange,
  onCityLocationsChange,
  onLocationModeChange,
  onProximityChange,
  onSearchScopeChange,
  onMatchStrictnessChange,
  onToggleWorkplaceType,
}: LocationPreferencesProps) {
  return (
    <div className="flex flex-col gap-4 pb-2">
      {values.locationMode === "cities" && countrySuggestion ? (
        <Alert className="border-sky-500/20 bg-sky-500/5">
          <Info />
          <AlertTitle>Detected from your browser</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">
                We detected{" "}
                <span className="font-medium text-foreground">
                  {formatCountryLabel(countrySuggestion)}
                </span>{" "}
                as a helpful starting point. Apply it to unlock country-specific
                sources, or choose another country.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={onUseCountrySuggestion}
              >
                Use suggestion
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Search area</Label>
        <AutomaticChoiceCardGroup
          ariaLabel="Search area"
          value={values.locationMode}
          columns={2}
          options={[
            {
              value: "radius",
              label: "Map radius",
              description: "Search around a point you choose on the map.",
            },
            {
              value: "cities",
              label: "City list",
              description: "Choose a country and cities.",
            },
          ]}
          onValueChange={onLocationModeChange}
        />
      </div>

      {values.locationMode === "cities" ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col gap-2">
            <Label className="text-base font-semibold">Country</Label>
            <SearchableDropdown
              value={values.country}
              options={countryOptions}
              onValueChange={onCountryChange}
              placeholder="Select country"
              searchPlaceholder="Search country..."
              emptyText="No matching countries."
              triggerClassName="h-10 w-full"
              ariaLabel={
                values.country
                  ? formatCountryLabel(values.country)
                  : "Select country"
              }
            />
            {countrySelectionInvalid ? (
              <p className="text-xs text-destructive">
                {countrySuggestion
                  ? "Select a country or use the browser suggestion."
                  : "Select a country."}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="city-locations-input"
              className="text-base font-semibold"
            >
              Cities
            </Label>
            <TokenizedInput
              id="city-locations-input"
              values={values.cityLocations}
              draft={cityLocationDraft}
              parseInput={parseCityLocationsInput}
              onDraftChange={onCityLocationDraftChange}
              onValuesChange={onCityLocationsChange}
              placeholder='e.g. "London"'
              removeLabelPrefix="Remove city"
            />
          </div>
        </div>
      ) : null}

      {values.locationMode === "radius" ? (
        <LocationRadiusPicker
          country={values.country}
          value={values.proximity}
          radiusMiles={values.proximity?.radiusMiles ?? 50}
          onChange={onProximityChange}
          onCountryChange={onCountryChange}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Work arrangement</p>
        <AutomaticMultiChoiceCardGroup
          ariaLabel="Work arrangement"
          values={workplaceTypes}
          columns={3}
          options={WORKPLACE_TYPE_OPTIONS.map((workplaceType) => ({
            value: workplaceType,
            label: formatWorkplaceTypeLabel(workplaceType),
            ariaLabel:
              workplaceType === "onsite"
                ? "Onsite"
                : formatWorkplaceTypeLabel(workplaceType),
          }))}
          onValueChange={onToggleWorkplaceType}
        />
        {workplaceTypeSelectionInvalid ? (
          <p className="text-xs text-destructive">
            Select at least one workplace type.
          </p>
        ) : null}
      </div>
      <Accordion type="single" collapsible>
        <AccordionItem value="matching" className="border-b-0">
          <AccordionTrigger
            aria-label="Location matching"
            className="py-2 text-sm hover:no-underline"
          >
            Remote scope & location matching
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 md:grid-cols-2">
              <RadioOptionGroup
                label="Location scope"
                value={values.searchScope}
                options={SEARCH_SCOPE_OPTIONS}
                onChange={(value) =>
                  onSearchScopeChange(value as LocationSearchScope)
                }
              />
              <RadioOptionGroup
                label="Match strictness"
                value={values.matchStrictness}
                options={MATCH_STRICTNESS_OPTIONS}
                onChange={(value) =>
                  onMatchStrictnessChange(value as LocationMatchStrictness)
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

interface RadioOption {
  value: string;
  label: string;
  description: string;
}

interface RadioOptionGroupProps {
  label: string;
  value: string;
  options: RadioOption[];
  onChange: (value: string) => void;
}

function RadioOptionGroup({
  label,
  value,
  options,
  onChange,
}: RadioOptionGroupProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <AutomaticChoiceCardGroup
        ariaLabel={label}
        value={value}
        options={options}
        columns={1}
        onValueChange={onChange}
      />
    </div>
  );
}

interface AutomaticRunAdvancedSettingsProps {
  selectedPreset: AutomaticPresetSelection;
  onApplyPreset: (presetId: AutomaticPresetId) => void;
  onSelectCustomPreset: () => void;
  advancedOpen: boolean;
  topNInput: string;
  minScoreInput: string;
  runBudgetInput: string;
  minRunBudget: number;
  maxRunBudget: number;
  onAdvancedOpenChange: (open: boolean) => void;
  onTopNInputChange: (value: string) => void;
  onMinScoreInputChange: (value: string) => void;
  onRunBudgetInputChange: (value: string) => void;
  onRunBudgetInputBlur: () => void;
}

export function AutomaticRunAdvancedSettings({
  selectedPreset,
  onApplyPreset,
  onSelectCustomPreset,
  advancedOpen,
  topNInput,
  minScoreInput,
  runBudgetInput,
  minRunBudget,
  maxRunBudget,
  onAdvancedOpenChange,
  onTopNInputChange,
  onMinScoreInputChange,
  onRunBudgetInputChange,
  onRunBudgetInputBlur,
}: AutomaticRunAdvancedSettingsProps) {
  return (
    <Accordion
      type="single"
      collapsible
      value={advancedOpen ? "advanced" : ""}
      onValueChange={(value) => onAdvancedOpenChange(value === "advanced")}
    >
      <AccordionItem value="advanced" className="border-b-0">
        <AccordionTrigger
          aria-label="Run settings"
          className="py-4 text-sm font-medium hover:no-underline"
        >
          Advanced search settings
        </AccordionTrigger>
        <AccordionContent className="pb-6">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Label>Search depth</Label>
              <AutomaticChoiceCardGroup
                ariaLabel="Search depth"
                value={selectedPreset}
                columns={4}
                options={[
                  {
                    value: "fast",
                    label: "Fast",
                    description: "A quick first pass.",
                  },
                  {
                    value: "balanced",
                    label: "Balanced",
                    description: "Everyday coverage.",
                  },
                  {
                    value: "detailed",
                    label: "Detailed",
                    description: "Broader discovery.",
                  },
                  {
                    value: "custom",
                    label: "Custom",
                    description: "Your own settings.",
                  },
                ]}
                onValueChange={(preset) => {
                  if (preset === "custom") onSelectCustomPreset();
                  else onApplyPreset(preset as AutomaticPresetId);
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="top-n">Resumes tailored</Label>
                <Input
                  id="top-n"
                  type="number"
                  min={1}
                  max={50}
                  value={topNInput}
                  onChange={(event) => onTopNInputChange(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="min-score">Min suitability score</Label>
                <Input
                  id="min-score"
                  type="number"
                  min={0}
                  max={100}
                  value={minScoreInput}
                  onChange={(event) =>
                    onMinScoreInputChange(event.target.value)
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="jobs-per-term">Max jobs discovered</Label>
                <Input
                  id="jobs-per-term"
                  type="number"
                  min={minRunBudget}
                  max={maxRunBudget}
                  value={runBudgetInput}
                  onChange={(event) =>
                    onRunBudgetInputChange(event.target.value)
                  }
                  onBlur={onRunBudgetInputBlur}
                />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function formatWorkplaceTypeLabel(workplaceType: WorkplaceType): string {
  if (workplaceType === "onsite") return "On-site";
  return workplaceType.charAt(0).toUpperCase() + workplaceType.slice(1);
}
