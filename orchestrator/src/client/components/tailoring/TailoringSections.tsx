import { TokenizedInput } from "@client/pages/orchestrator/TokenizedInput";
import type { ResumeProjectCatalogItem } from "@shared/types.js";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProjectSelector } from "../discovered-panel/ProjectSelector";
import type { EditableSkillGroup } from "../tailoring-utils";

interface TailoringSectionsProps {
  catalog: ResumeProjectCatalogItem[];
  isCatalogLoading: boolean;
  summary: string;
  headline: string;
  jobDescription: string;
  skillsDraft: EditableSkillGroup[];
  selectedIds: Set<string>;
  tracerLinksEnabled: boolean;
  tracerEnableBlocked: boolean;
  tracerEnableBlockedReason: string | null;
  tracerReadinessChecking?: boolean;
  generatingSection: "summary" | "headline" | "skills" | null;
  openSkillGroupId: string;
  disableInputs: boolean;
  onGenerateSummary: () => void;
  onGenerateHeadline: () => void;
  onGenerateSkills: () => void;
  onSummaryChange: (value: string) => void;
  onHeadlineChange: (value: string) => void;
  onUndoSummary: () => void;
  onUndoHeadline: () => void;
  onUndoSkills: () => void;
  onRedoSummary: () => void;
  onRedoHeadline: () => void;
  onRedoSkills: () => void;
  canUndoSummary: boolean;
  canUndoHeadline: boolean;
  canUndoSkills: boolean;
  canRedoSummary: boolean;
  canRedoHeadline: boolean;
  canRedoSkills: boolean;
  undoDisabledReason?: string | null;
  onDescriptionChange: (value: string) => void;
  onSkillGroupOpenChange: (value: string) => void;
  onAddSkillGroup: () => void;
  onUpdateSkillGroup: (
    id: string,
    key: "name" | "keywordsText",
    value: string,
  ) => void;
  onRemoveSkillGroup: (id: string) => void;
  onToggleProject: (id: string) => void;
  onTracerLinksEnabledChange: (value: boolean) => void;
}

type SectionState =
  | "ready"
  | "review"
  | "missing"
  | "optional"
  | "source"
  | "none";

const sectionClass =
  "overflow-hidden rounded-md border border-border/55 bg-background/25 px-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
const triggerClass =
  "min-h-11 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/20 hover:no-underline data-[state=open]:border-b data-[state=open]:border-border/45";
const inputClass =
  "w-full rounded-md border border-border/60 bg-background/65 px-3 py-2 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const actionButtonClass =
  "h-7 border-border/60 bg-background/45 px-2 text-[11px] text-muted-foreground hover:bg-muted/35 hover:text-foreground";

const stateCopy: Record<
  SectionState,
  { label: string; icon: React.ElementType; className: string }
> = {
  ready: {
    label: "Ready",
    icon: CheckCircle2,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
  review: {
    label: "Needs review",
    icon: CircleAlert,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  },
  missing: {
    label: "Missing",
    icon: Circle,
    className: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  },
  optional: {
    label: "Optional",
    icon: Circle,
    className: "border-border/60 bg-muted/20 text-muted-foreground",
  },
  none: {
    label: "None",
    icon: Circle,
    className: "border-border/60 bg-muted/20 text-muted-foreground",
  },
  source: {
    label: "Source",
    icon: Circle,
    className: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  },
};

const textHasValue = (value: string) => value.trim().length > 0;

const sectionStateForText = (value: string): SectionState =>
  textHasValue(value) ? "ready" : "missing";

const parseSkillGroupKeywordsInput = (input: string): string[] =>
  input
    .split(/[\n,]/g)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

const skillGroupHasKeywords = (keywordsText: string) =>
  parseSkillGroupKeywordsInput(keywordsText).length > 0;

const skillGroupNeedsReview = (group: EditableSkillGroup) =>
  !textHasValue(group.name) || !skillGroupHasKeywords(group.keywordsText);

const SectionTriggerLabel: React.FC<{
  title: string;
  state: SectionState;
  badgeLabel?: string;
  count?: number;
  children?: React.ReactNode;
}> = ({ title, state, badgeLabel, count, children }) => {
  const copy = stateCopy[state];
  const resolvedBadgeLabel =
    badgeLabel ??
    `${copy.label}${typeof count === "number" && count > 0 ? ` ${count}` : ""}`;

  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-foreground/85">
          {title}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
            copy.className,
          )}
        >
          {resolvedBadgeLabel}
        </span>
      </span>
      {children ? (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {children}
        </span>
      ) : null}
    </span>
  );
};

export const TailoringSections: React.FC<TailoringSectionsProps> = ({
  catalog,
  isCatalogLoading,
  summary,
  headline,
  jobDescription,
  skillsDraft,
  selectedIds,
  tracerLinksEnabled,
  tracerEnableBlocked,
  tracerEnableBlockedReason,
  tracerReadinessChecking = false,
  generatingSection,
  openSkillGroupId,
  disableInputs,
  onGenerateSummary,
  onGenerateHeadline,
  onGenerateSkills,
  onSummaryChange,
  onHeadlineChange,
  onUndoSummary,
  onUndoHeadline,
  onUndoSkills,
  onRedoSummary,
  onRedoHeadline,
  onRedoSkills,
  canUndoSummary,
  canUndoHeadline,
  canUndoSkills,
  canRedoSummary,
  canRedoHeadline,
  canRedoSkills,
  undoDisabledReason = null,
  onDescriptionChange,
  onSkillGroupOpenChange,
  onAddSkillGroup,
  onUpdateSkillGroup,
  onRemoveSkillGroup,
  onToggleProject,
  onTracerLinksEnabledChange,
}) => {
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>(
    {},
  );
  const tracerToggleDisabled =
    disableInputs || (!tracerLinksEnabled && tracerEnableBlocked);
  const generateTooltip = "Generate";
  const undoTooltip = "Undo to template";
  const redoTooltip = "Redo to AI draft";
  const skillsState: SectionState =
    skillsDraft.length === 0
      ? "none"
      : skillsDraft.some(skillGroupNeedsReview)
        ? "review"
        : "ready";
  const projectsState: SectionState = selectedIds.size > 0 ? "ready" : "none";

  return (
    <TooltipProvider>
      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="summary" className={sectionClass}>
          <AccordionTrigger className={triggerClass} aria-label="Summary">
            <SectionTriggerLabel
              title="Summary"
              state={sectionStateForText(summary)}
            />
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-3">
            <div className="mb-2 flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={actionButtonClass}
                    onClick={onGenerateSummary}
                    disabled={disableInputs}
                    aria-label="Generate summary"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {generatingSection === "summary"
                      ? "Generating..."
                      : generateTooltip}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{generateTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onUndoSummary}
                    disabled={disableInputs || !canUndoSummary}
                    aria-label={undoTooltip}
                    title={
                      !canUndoSummary
                        ? (undoDisabledReason ?? undefined)
                        : undefined
                    }
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{undoTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onRedoSummary}
                    disabled={disableInputs || !canRedoSummary}
                    aria-label={redoTooltip}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{redoTooltip}</TooltipContent>
              </Tooltip>
            </div>
            <label htmlFor="tailor-summary-edit" className="sr-only">
              Tailored Summary
            </label>
            <textarea
              id="tailor-summary-edit"
              className={`${inputClass} min-h-[120px]`}
              value={summary}
              onChange={(event) => onSummaryChange(event.target.value)}
              placeholder="Write a tailored summary for this role, or generate with AI..."
              disabled={disableInputs}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="headline" className={sectionClass}>
          <AccordionTrigger className={triggerClass} aria-label="Headline">
            <SectionTriggerLabel
              title="Headline"
              state={sectionStateForText(headline)}
            />
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-3">
            <div className="mb-2 flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={actionButtonClass}
                    onClick={onGenerateHeadline}
                    disabled={disableInputs}
                    aria-label="Generate headline"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {generatingSection === "headline"
                      ? "Generating..."
                      : generateTooltip}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{generateTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onUndoHeadline}
                    disabled={disableInputs || !canUndoHeadline}
                    aria-label={undoTooltip}
                    title={
                      !canUndoHeadline
                        ? (undoDisabledReason ?? undefined)
                        : undefined
                    }
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{undoTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onRedoHeadline}
                    disabled={disableInputs || !canRedoHeadline}
                    aria-label={redoTooltip}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{redoTooltip}</TooltipContent>
              </Tooltip>
            </div>
            <label htmlFor="tailor-headline-edit" className="sr-only">
              Tailored Headline
            </label>
            <input
              id="tailor-headline-edit"
              type="text"
              className={inputClass}
              value={headline}
              onChange={(event) => onHeadlineChange(event.target.value)}
              placeholder="Write a concise headline tailored to this role..."
              disabled={disableInputs}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="skills" className={sectionClass}>
          <AccordionTrigger
            className={triggerClass}
            aria-label="Tailored Skills"
          >
            <SectionTriggerLabel
              title="Tailored Skills"
              state={skillsState}
              count={skillsDraft.length > 0 ? skillsDraft.length : undefined}
            />
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-3">
            <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={actionButtonClass}
                    onClick={onGenerateSkills}
                    disabled={disableInputs}
                    aria-label="Generate skills"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {generatingSection === "skills"
                      ? "Generating..."
                      : generateTooltip}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{generateTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onUndoSkills}
                    disabled={disableInputs || !canUndoSkills}
                    aria-label={undoTooltip}
                    title={
                      !canUndoSkills
                        ? (undoDisabledReason ?? undefined)
                        : undefined
                    }
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{undoTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onRedoSkills}
                    disabled={disableInputs || !canRedoSkills}
                    aria-label={redoTooltip}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{redoTooltip}</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={actionButtonClass}
                onClick={onAddSkillGroup}
                disabled={disableInputs}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Skill Group
              </Button>
            </div>

            {skillsDraft.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">
                No skill groups yet. Add one to tailor keywords for this role.
              </div>
            ) : (
              <Accordion
                type="single"
                collapsible
                value={openSkillGroupId}
                onValueChange={onSkillGroupOpenChange}
                className="space-y-2"
              >
                {skillsDraft.map((group, index) => (
                  <AccordionItem
                    key={group.id}
                    value={group.id}
                    className="rounded-md border border-border/55 bg-background/45 px-0"
                  >
                    <AccordionTrigger className="px-3 py-2 text-[11px] font-medium hover:bg-muted/20 hover:no-underline">
                      {group.name.trim() || `Skill Group ${index + 1}`}
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-2">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label
                            htmlFor={`tailor-skill-group-name-${group.id}`}
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            Category
                          </label>
                          <input
                            id={`tailor-skill-group-name-${group.id}`}
                            type="text"
                            className={inputClass}
                            value={group.name}
                            onChange={(event) =>
                              onUpdateSkillGroup(
                                group.id,
                                "name",
                                event.target.value,
                              )
                            }
                            placeholder="Backend, Frontend, Infrastructure..."
                            disabled={disableInputs}
                          />
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor={`tailor-skill-group-keywords-${group.id}`}
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            Keywords (comma-separated)
                          </label>
                          <TokenizedInput
                            id={`tailor-skill-group-keywords-${group.id}`}
                            values={parseSkillGroupKeywordsInput(
                              group.keywordsText,
                            )}
                            draft={keywordDrafts[group.id] ?? ""}
                            parseInput={parseSkillGroupKeywordsInput}
                            onDraftChange={(value) =>
                              setKeywordDrafts((current) => ({
                                ...current,
                                [group.id]: value,
                              }))
                            }
                            onValuesChange={(values) =>
                              onUpdateSkillGroup(
                                group.id,
                                "keywordsText",
                                values.join(", "),
                              )
                            }
                            placeholder="TypeScript, Node.js, REST APIs..."
                            helperText="Press Enter, comma, or paste a list to add keywords."
                            removeLabelPrefix="Remove keyword"
                            disabled={disableInputs}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => onRemoveSkillGroup(group.id)}
                            disabled={disableInputs}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </AccordionContent>
        </AccordionItem>

        {!isCatalogLoading && catalog.length > 0 && (
          <AccordionItem value="projects" className={sectionClass}>
            <AccordionTrigger
              className={triggerClass}
              aria-label="Selected Projects"
            >
              <SectionTriggerLabel
                title="Selected Projects"
                state={projectsState}
                badgeLabel={
                  selectedIds.size > 0 ? String(selectedIds.size) : undefined
                }
              />
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-3">
              <ProjectSelector
                catalog={catalog}
                selectedIds={selectedIds}
                onToggle={onToggleProject}
                maxProjects={3}
                disabled={disableInputs}
              />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="tracer-links" className={sectionClass}>
          <AccordionTrigger className={triggerClass} aria-label="Tracer Links">
            <SectionTriggerLabel
              title="Tracer Links"
              state={tracerLinksEnabled ? "ready" : "optional"}
            />
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-3">
            <div className="rounded-md border border-border/60 bg-background/55 p-3">
              <label
                htmlFor="tailor-tracer-links-enabled"
                className="flex cursor-pointer items-center gap-3"
              >
                <Checkbox
                  id="tailor-tracer-links-enabled"
                  checked={tracerLinksEnabled}
                  onCheckedChange={(checked) =>
                    onTracerLinksEnabledChange(Boolean(checked))
                  }
                  disabled={tracerToggleDisabled}
                />
                <span className="text-sm font-medium text-foreground">
                  Enable tracer links for this job
                </span>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {tracerReadinessChecking
                  ? "Checking tracer-link readiness..."
                  : "When enabled, outgoing resume links are rewritten to JobOps tracer links on the next PDF generation. Existing PDFs are unchanged."}
              </p>
              {tracerEnableBlockedReason && !tracerLinksEnabled ? (
                <p className="mt-2 text-xs text-destructive">
                  Tracer links are unavailable: {tracerEnableBlockedReason}
                </p>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="job-description" className={sectionClass}>
          <AccordionTrigger
            className={triggerClass}
            aria-label="Job Description"
          >
            <SectionTriggerLabel
              title="Job Description"
              state={
                sectionStateForText(jobDescription) === "ready"
                  ? "source"
                  : "missing"
              }
            />
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-3">
            <label htmlFor="tailor-jd-edit" className="sr-only">
              Job Description
            </label>
            <textarea
              id="tailor-jd-edit"
              className={`${inputClass} min-h-[120px] max-h-[250px]`}
              value={jobDescription}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="The raw job description..."
              disabled={disableInputs}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </TooltipProvider>
  );
};
