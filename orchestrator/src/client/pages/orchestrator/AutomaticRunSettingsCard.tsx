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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { Separator } from "@/components/ui/separator";
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
  selectedPreset: AutomaticPresetSelection;
  values: AutomaticRunValues;
  locationSummary: string;
  countryOptions: Array<{ value: string; label: string }>;
  countrySuggestion: string | null;
  countrySelectionInvalid: boolean;
  cityLocationDraft: string;
  workplaceTypes: WorkplaceType[];
  workplaceTypeSelectionInvalid: boolean;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  advancedOpen: boolean;
  topNInput: string;
  minScoreInput: string;
  runBudgetInput: string;
  minRunBudget: number;
  maxRunBudget: number;
  onApplyPreset: (presetId: AutomaticPresetId) => void;
  onSelectCustomPreset: () => void;
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
  onSearchScopeChange: (value: LocationSearchScope) => void;
  onMatchStrictnessChange: (value: LocationMatchStrictness) => void;
  onAdvancedOpenChange: (open: boolean) => void;
  onTopNInputChange: (value: string) => void;
  onMinScoreInputChange: (value: string) => void;
  onRunBudgetInputChange: (value: string) => void;
  onRunBudgetInputBlur: () => void;
}

export function AutomaticRunSettingsCard({
  selectedPreset,
  values,
  locationSummary,
  countryOptions,
  countrySuggestion,
  countrySelectionInvalid,
  cityLocationDraft,
  workplaceTypes,
  workplaceTypeSelectionInvalid,
  searchScope,
  matchStrictness,
  advancedOpen,
  topNInput,
  minScoreInput,
  runBudgetInput,
  minRunBudget,
  maxRunBudget,
  onApplyPreset,
  onSelectCustomPreset,
  onCountryChange,
  onUseCountrySuggestion,
  onCityLocationDraftChange,
  onCityLocationsChange,
  onLocationModeChange,
  onProximityChange,
  onToggleWorkplaceType,
  onSearchScopeChange,
  onMatchStrictnessChange,
  onAdvancedOpenChange,
  onTopNInputChange,
  onMinScoreInputChange,
  onRunBudgetInputChange,
  onRunBudgetInputBlur,
}: AutomaticRunSettingsCardProps) {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <PresetPicker
          selectedPreset={selectedPreset}
          onApplyPreset={onApplyPreset}
          onSelectCustomPreset={onSelectCustomPreset}
        />
        <Separator />
        <LocationPreferences
          values={values}
          locationSummary={locationSummary}
          countryOptions={countryOptions}
          countrySuggestion={countrySuggestion}
          countrySelectionInvalid={countrySelectionInvalid}
          cityLocationDraft={cityLocationDraft}
          workplaceTypes={workplaceTypes}
          workplaceTypeSelectionInvalid={workplaceTypeSelectionInvalid}
          searchScope={searchScope}
          matchStrictness={matchStrictness}
          onCountryChange={onCountryChange}
          onUseCountrySuggestion={onUseCountrySuggestion}
          onCityLocationDraftChange={onCityLocationDraftChange}
          onCityLocationsChange={onCityLocationsChange}
          onLocationModeChange={onLocationModeChange}
          onProximityChange={onProximityChange}
          onToggleWorkplaceType={onToggleWorkplaceType}
          onSearchScopeChange={onSearchScopeChange}
          onMatchStrictnessChange={onMatchStrictnessChange}
        />
        <RunSettings
          advancedOpen={advancedOpen}
          topNInput={topNInput}
          minScoreInput={minScoreInput}
          runBudgetInput={runBudgetInput}
          minRunBudget={minRunBudget}
          maxRunBudget={maxRunBudget}
          onAdvancedOpenChange={onAdvancedOpenChange}
          onTopNInputChange={onTopNInputChange}
          onMinScoreInputChange={onMinScoreInputChange}
          onRunBudgetInputChange={onRunBudgetInputChange}
          onRunBudgetInputBlur={onRunBudgetInputBlur}
        />
      </CardContent>
    </Card>
  );
}

interface PresetPickerProps {
  selectedPreset: AutomaticPresetSelection;
  onApplyPreset: (presetId: AutomaticPresetId) => void;
  onSelectCustomPreset: () => void;
}

function PresetPicker({
  selectedPreset,
  onApplyPreset,
  onSelectCustomPreset,
}: PresetPickerProps) {
  return (
    <div className="grid items-center gap-3 md:grid-cols-[120px_1fr]">
      <Label className="text-base font-semibold">Preset</Label>
      <div className="flex flex-wrap gap-2">
        {(["fast", "balanced", "detailed"] as const).map((presetId) => (
          <Button
            key={presetId}
            type="button"
            size="sm"
            variant={selectedPreset === presetId ? "default" : "outline"}
            aria-pressed={selectedPreset === presetId}
            onClick={() => onApplyPreset(presetId)}
          >
            {presetId.charAt(0).toUpperCase() + presetId.slice(1)}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={selectedPreset === "custom" ? "secondary" : "outline"}
          aria-pressed={selectedPreset === "custom"}
          onClick={onSelectCustomPreset}
        >
          Custom
        </Button>
      </div>
    </div>
  );
}

interface LocationPreferencesProps {
  values: AutomaticRunValues;
  locationSummary: string;
  countryOptions: Array<{ value: string; label: string }>;
  countrySuggestion: string | null;
  countrySelectionInvalid: boolean;
  cityLocationDraft: string;
  workplaceTypes: WorkplaceType[];
  workplaceTypeSelectionInvalid: boolean;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
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
  onSearchScopeChange: (value: LocationSearchScope) => void;
  onMatchStrictnessChange: (value: LocationMatchStrictness) => void;
}

function LocationPreferences({
  values,
  locationSummary,
  countryOptions,
  countrySuggestion,
  countrySelectionInvalid,
  cityLocationDraft,
  workplaceTypes,
  workplaceTypeSelectionInvalid,
  searchScope,
  matchStrictness,
  onCountryChange,
  onUseCountrySuggestion,
  onCityLocationDraftChange,
  onCityLocationsChange,
  onLocationModeChange,
  onProximityChange,
  onToggleWorkplaceType,
  onSearchScopeChange,
  onMatchStrictnessChange,
}: LocationPreferencesProps) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="location-intent"
      className="w-full"
    >
      <AccordionItem value="location-intent" className="border-b-0">
        <AccordionTrigger
          aria-label="Review and edit location intent"
          className="gap-4 py-2 hover:no-underline"
        >
          <div className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="py-0 text-base font-semibold hover:no-underline">
                Location preferences
              </p>
              <p className="truncate text-sm text-muted-foreground whitespace-pre-wrap">
                {locationSummary}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {countrySuggestion ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                >
                  Browser suggestion
                </Badge>
              ) : null}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-4">
          {values.locationMode === "cities" && countrySuggestion ? (
            <Alert className="border-sky-500/20 bg-sky-500/5">
              <Info className="h-4 w-4" />
              <AlertTitle>Detected from your browser</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-muted-foreground">
                    We detected{" "}
                    <span className="font-medium text-foreground">
                      {formatCountryLabel(countrySuggestion)}
                    </span>{" "}
                    as a helpful starting point. Apply it to unlock
                    country-specific sources, or choose another country.
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
            <RadioGroup
              value={values.locationMode}
              onValueChange={(value) =>
                onLocationModeChange(value as LocationInputMode)
              }
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="location-mode-radius"
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem
                  id="location-mode-radius"
                  value="radius"
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Map radius</span>
                  <span className="text-xs text-muted-foreground">
                    Search around a point you choose on the map.
                  </span>
                </span>
              </label>
              <label
                htmlFor="location-mode-cities"
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem
                  id="location-mode-cities"
                  value="cities"
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Manual cities</span>
                  <span className="text-xs text-muted-foreground">
                    Enter the exact cities each source should search.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {values.locationMode === "cities" ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-2">
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

              <div className="space-y-2">
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

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Work arrangement
            </p>
            <div className="flex flex-wrap gap-2 gap-x-4">
              {WORKPLACE_TYPE_OPTIONS.map((workplaceType) => {
                const checkboxId = `workplace-type-${workplaceType}`;
                const checked = workplaceTypes.includes(workplaceType);

                return (
                  <label
                    key={workplaceType}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-center gap-3 text-sm transition-colors"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      onCheckedChange={(nextChecked) => {
                        onToggleWorkplaceType(
                          workplaceType,
                          nextChecked === true,
                        );
                      }}
                    />
                    {formatWorkplaceTypeLabel(workplaceType)}
                  </label>
                );
              })}
            </div>
            {workplaceTypeSelectionInvalid ? (
              <p className="text-xs text-destructive">
                Select at least one workplace type.
              </p>
            ) : null}
          </div>

          <RadioOptionGroup
            label="Location scope"
            value={searchScope}
            options={SEARCH_SCOPE_OPTIONS}
            idPrefix="search-scope"
            onChange={(value) =>
              onSearchScopeChange(value as LocationSearchScope)
            }
          />
          <RadioOptionGroup
            label="Match strictness"
            value={matchStrictness}
            options={MATCH_STRICTNESS_OPTIONS}
            idPrefix="match-strictness"
            onChange={(value) =>
              onMatchStrictnessChange(value as LocationMatchStrictness)
            }
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface RadioOption {
  value: string;
  label: string;
}

interface RadioOptionGroupProps {
  label: string;
  value: string;
  options: RadioOption[];
  idPrefix: string;
  onChange: (value: string) => void;
}

function RadioOptionGroup({
  label,
  value,
  options,
  idPrefix,
  onChange,
}: RadioOptionGroupProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={getRadioOptionClassName(selected)}
            >
              <RadioGroupItem value={option.value} id={id} />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

interface RunSettingsProps {
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

function RunSettings({
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
}: RunSettingsProps) {
  return (
    <Accordion
      type="single"
      collapsible
      value={advancedOpen ? "advanced" : ""}
      onValueChange={(value) => onAdvancedOpenChange(value === "advanced")}
    >
      <AccordionItem value="advanced" className="border-b-0">
        <AccordionTrigger className="py-0 text-base font-semibold hover:no-underline">
          Run settings
        </AccordionTrigger>
        <AccordionContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="min-score">Min suitability score</Label>
              <Input
                id="min-score"
                type="number"
                min={0}
                max={100}
                value={minScoreInput}
                onChange={(event) => onMinScoreInputChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobs-per-term">Max jobs discovered</Label>
              <Input
                id="jobs-per-term"
                type="number"
                min={minRunBudget}
                max={maxRunBudget}
                value={runBudgetInput}
                onChange={(event) => onRunBudgetInputChange(event.target.value)}
                onBlur={onRunBudgetInputBlur}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function formatWorkplaceTypeLabel(workplaceType: WorkplaceType): string {
  if (workplaceType === "onsite") return "Onsite";
  return workplaceType.charAt(0).toUpperCase() + workplaceType.slice(1);
}

function getRadioOptionClassName(selected: boolean): string {
  return `flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
    selected
      ? "border-border/70 bg-muted/20 text-foreground"
      : "border-border/60 text-foreground hover:bg-muted/20"
  }`;
}
