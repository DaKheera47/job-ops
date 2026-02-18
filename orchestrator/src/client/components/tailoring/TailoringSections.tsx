import type { ResumeProjectCatalogItem } from "@shared/types.js";
import { Plus, Trash2 } from "lucide-react";
import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  openSkillGroupId: string;
  disableInputs: boolean;
  onSummaryChange: (value: string) => void;
  onHeadlineChange: (value: string) => void;
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

const sectionClass = "rounded-lg border border-border/60 bg-muted/20 px-0";
const triggerClass =
  "px-3 py-2 text-xs font-medium text-muted-foreground hover:no-underline";
const inputClass =
  "w-full rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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
  openSkillGroupId,
  disableInputs,
  onSummaryChange,
  onHeadlineChange,
  onDescriptionChange,
  onSkillGroupOpenChange,
  onAddSkillGroup,
  onUpdateSkillGroup,
  onRemoveSkillGroup,
  onToggleProject,
  onTracerLinksEnabledChange,
}) => {
  const tracerToggleDisabled =
    disableInputs || (!tracerLinksEnabled && tracerEnableBlocked);

  return (
    <Accordion type="multiple" className="space-y-3">
      <AccordionItem value="job-description" className={sectionClass}>
        <AccordionTrigger className={triggerClass}>
          Job Description
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-1">
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

      <AccordionItem value="summary" className={sectionClass}>
        <AccordionTrigger className={triggerClass}>Summary</AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-1">
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
        <AccordionTrigger className={triggerClass}>Headline</AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-1">
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
        <AccordionTrigger className={triggerClass}>
          Tailored Skills
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-1">
          <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={onAddSkillGroup}
              disabled={disableInputs}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Skill Group
            </Button>
          </div>

          {skillsDraft.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
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
                  className="rounded-lg border border-border/60 bg-background/40 px-0"
                >
                  <AccordionTrigger className="px-3 py-2 text-[11px] font-medium hover:no-underline">
                    {group.name.trim() || `Skill Group ${index + 1}`}
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 pt-1">
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
                        <textarea
                          id={`tailor-skill-group-keywords-${group.id}`}
                          className={`${inputClass} min-h-[88px]`}
                          value={group.keywordsText}
                          onChange={(event) =>
                            onUpdateSkillGroup(
                              group.id,
                              "keywordsText",
                              event.target.value,
                            )
                          }
                          placeholder="TypeScript, Node.js, REST APIs..."
                          disabled={disableInputs}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
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
          <AccordionTrigger className={triggerClass}>
            Selected Projects
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-1">
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
        <AccordionTrigger className={triggerClass}>
          Tracer Links
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-1">
          <div className="rounded-md border border-border/60 bg-background/60 p-3">
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
    </Accordion>
  );
};
