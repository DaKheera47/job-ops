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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  AutomaticChoiceCardGroup,
  AutomaticMultiChoiceCardGroup,
} from "./AutomaticChoiceCardGroup";
import {
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
  onToggleWorkplaceType,
}: AutomaticRunSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
            2
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Where can you work?</CardTitle>
            <CardDescription>
              Choose a location model and the work arrangements you want.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
          onToggleWorkplaceType={onToggleWorkplaceType}
        />
      </CardContent>
    </Card>
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
  onToggleWorkplaceType,
}: LocationPreferencesProps) {
  return (
    <div className="flex flex-col gap-4">
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
              label: "Manual cities",
              description: "Enter the exact cities each source should search.",
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
            description: formatWorkplaceTypeDescription(workplaceType),
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
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  advancedOpen: boolean;
  topNInput: string;
  minScoreInput: string;
  runBudgetInput: string;
  minRunBudget: number;
  maxRunBudget: number;
  onSearchScopeChange: (value: LocationSearchScope) => void;
  onMatchStrictnessChange: (value: LocationMatchStrictness) => void;
  onAdvancedOpenChange: (open: boolean) => void;
  onTopNInputChange: (value: string) => void;
  onMinScoreInputChange: (value: string) => void;
  onRunBudgetInputChange: (value: string) => void;
  onRunBudgetInputBlur: () => void;
}

export function AutomaticRunAdvancedSettings({
  searchScope,
  matchStrictness,
  advancedOpen,
  topNInput,
  minScoreInput,
  runBudgetInput,
  minRunBudget,
  maxRunBudget,
  onSearchScopeChange,
  onMatchStrictnessChange,
  onAdvancedOpenChange,
  onTopNInputChange,
  onMinScoreInputChange,
  onRunBudgetInputChange,
  onRunBudgetInputBlur,
}: AutomaticRunAdvancedSettingsProps) {
  return (
    <Card>
      <Accordion
        type="single"
        collapsible
        value={advancedOpen ? "advanced" : ""}
        onValueChange={(value) => onAdvancedOpenChange(value === "advanced")}
      >
        <AccordionItem value="advanced" className="border-b-0">
          <AccordionTrigger
            aria-label="Run settings"
            className="px-6 py-5 text-base font-semibold hover:no-underline"
          >
            Advanced search settings
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <RadioOptionGroup
                  label="Location scope"
                  value={searchScope}
                  options={SEARCH_SCOPE_OPTIONS}
                  onChange={(value) =>
                    onSearchScopeChange(value as LocationSearchScope)
                  }
                />
                <RadioOptionGroup
                  label="Match strictness"
                  value={matchStrictness}
                  options={MATCH_STRICTNESS_OPTIONS}
                  onChange={(value) =>
                    onMatchStrictnessChange(value as LocationMatchStrictness)
                  }
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
    </Card>
  );
}

function formatWorkplaceTypeLabel(workplaceType: WorkplaceType): string {
  if (workplaceType === "onsite") return "On-site";
  return workplaceType.charAt(0).toUpperCase() + workplaceType.slice(1);
}

function formatWorkplaceTypeDescription(workplaceType: WorkplaceType): string {
  if (workplaceType === "remote") return "Work away from an office.";
  if (workplaceType === "hybrid") return "Split home and office time.";
  return "Primarily based at the workplace.";
}
