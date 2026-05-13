import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import { Accordion } from "@/components/ui/accordion";
import {
  BasicsCustomFieldsSection,
  BasicsSection,
  PictureSection,
  SummarySection,
} from "./DesignResumeInlineSections";
import {
  DesignResumeListSection,
  DesignResumeListSectionContent,
} from "./DesignResumeListSection";
import { DesignResumeSection } from "./DesignResumeSection";
import { ITEM_DEFINITIONS, type ItemDefinition } from "./definitions";
import { asArray, asRecord, setByPath } from "./utils";

type DesignResumeRailProps = {
  draft: DesignResumeDocument;
  onUpdateResumeJson: (
    updater: (resumeJson: DesignResumeJson) => DesignResumeJson,
  ) => void;
  onOpenDialog: (definition: ItemDefinition, index: number | null) => void;
  onUploadPicture: () => void;
  onDeletePicture: () => void;
  pictureUploading: boolean;
  pictureEnabled: boolean;
  pictureDisabledReason?: string | null;
  activeSectionId?: string | null;
};

export function DesignResumeRail({
  draft,
  onUpdateResumeJson,
  onOpenDialog,
  onUploadPicture,
  onDeletePicture,
  pictureUploading,
  pictureEnabled,
  pictureDisabledReason,
  activeSectionId = null,
}: DesignResumeRailProps) {
  const resumeJson = draft.resumeJson as Record<string, unknown>;
  const basics = (asRecord(resumeJson.basics) ?? {}) as Record<string, unknown>;
  const picture = (asRecord(resumeJson.picture) ?? {}) as Record<
    string,
    unknown
  >;
  const summary = (asRecord(resumeJson.summary) ?? {}) as Record<
    string,
    unknown
  >;
  const sections = (asRecord(resumeJson.sections) ?? {}) as Record<
    string,
    unknown
  >;
  const customFields = asArray(basics.customFields) as Record<
    string,
    unknown
  >[];

  const updateBasics = (path: string, value: unknown) => {
    onUpdateResumeJson((current) => {
      const next = structuredClone(current);
      const currentBasics = (asRecord(next.basics) ?? {}) as Record<
        string,
        unknown
      >;
      next.basics = setByPath(
        currentBasics,
        path,
        value,
      ) as DesignResumeJson["basics"];
      return next;
    });
  };

  const updatePicture = (key: string, value: unknown) => {
    onUpdateResumeJson((current) => {
      const next = structuredClone(current);
      const currentPicture = (asRecord(next.picture) ?? {}) as Record<
        string,
        unknown
      >;
      next.picture = {
        ...currentPicture,
        [key]: value,
      } as DesignResumeJson["picture"];
      return next;
    });
  };

  const updateSummary = (key: string, value: unknown) => {
    onUpdateResumeJson((current) => {
      const next = structuredClone(current);
      const currentSummary = (asRecord(next.summary) ?? {}) as Record<
        string,
        unknown
      >;
      next.summary = {
        ...currentSummary,
        [key]: value,
      } as DesignResumeJson["summary"];
      return next;
    });
  };

  const updateCustomFields = (nextFields: Record<string, unknown>[]) => {
    onUpdateResumeJson((current) => {
      const next = structuredClone(current);
      const currentBasics = (asRecord(next.basics) ?? {}) as Record<
        string,
        unknown
      >;
      next.basics = {
        ...currentBasics,
        customFields: nextFields,
      } as DesignResumeJson["basics"];
      return next;
    });
  };

  const updateSectionItems = (
    sectionKey: string,
    nextItems: Record<string, unknown>[],
  ) => {
    onUpdateResumeJson((current) => {
      const next = structuredClone(current);
      const currentSections = (asRecord(next.sections) ?? {}) as Record<
        string,
        unknown
      >;
      next.sections = {
        ...currentSections,
        [sectionKey]: {
          ...(asRecord(currentSections[sectionKey]) ?? {}),
          // Keep edited sections visible in preview/PDF when items are managed here.
          hidden: false,
          items: nextItems,
        },
      } as DesignResumeJson["sections"];
      return next;
    });
  };

  const getListSectionProps = (definition: ItemDefinition) => {
    const section = (asRecord(sections[definition.key]) ?? {}) as Record<
      string,
      unknown
    >;
    const items = asArray(section.items).map(
      (item) => asRecord(item) ?? {},
    ) as Record<string, unknown>[];

    return {
      definition,
      items,
      onAdd: () => onOpenDialog(definition, null),
      onEdit: (index: number) => onOpenDialog(definition, index),
      onUpdateItems: (nextItems: Record<string, unknown>[]) =>
        updateSectionItems(definition.key, nextItems),
    };
  };

  const renderActiveSection = () => {
    switch (activeSectionId) {
      case "picture":
        return (
          <PictureSection
            picture={picture}
            pictureUploading={pictureUploading}
            pictureEnabled={pictureEnabled}
            pictureDisabledReason={pictureDisabledReason}
            onUploadPicture={onUploadPicture}
            onDeletePicture={onDeletePicture}
            onUpdatePicture={updatePicture}
          />
        );
      case "basics":
        return (
          <BasicsSection
            resumeJson={draft.resumeJson}
            basics={basics}
            onUpdateBasics={updateBasics}
          />
        );
      case "basics-custom-fields":
        return (
          <BasicsCustomFieldsSection
            customFields={customFields}
            onChange={updateCustomFields}
          />
        );
      case "summary":
        return (
          <SummarySection
            resumeJson={draft.resumeJson}
            summary={summary}
            onUpdateSummary={updateSummary}
          />
        );
      default: {
        const definition = ITEM_DEFINITIONS.find(
          (item) => item.key === activeSectionId,
        );
        return definition ? (
          <DesignResumeListSectionContent
            {...getListSectionProps(definition)}
          />
        ) : null;
      }
    }
  };

  if (activeSectionId) {
    return <div className="space-y-4">{renderActiveSection()}</div>;
  }

  return (
    <Accordion type="multiple" defaultValue={[]} className="space-y-3">
      <DesignResumeSection
        value="picture"
        title="Picture"
        subtitle="Manage your resume photo and how it appears."
      >
        <PictureSection
          picture={picture}
          pictureUploading={pictureUploading}
          pictureEnabled={pictureEnabled}
          pictureDisabledReason={pictureDisabledReason}
          onUploadPicture={onUploadPicture}
          onDeletePicture={onDeletePicture}
          onUpdatePicture={updatePicture}
        />
      </DesignResumeSection>

      <DesignResumeSection
        value="basics"
        title="Basics"
        subtitle="Edit your name, headline, and contact details."
      >
        <BasicsSection
          resumeJson={draft.resumeJson}
          basics={basics}
          onUpdateBasics={updateBasics}
        />
      </DesignResumeSection>

      <DesignResumeSection
        value="basics-custom-fields"
        title="Basics Custom Fields"
        subtitle="Add extra links or short details near your contact info."
        badge={customFields.length === 0 ? "Empty" : `${customFields.length}`}
      >
        <BasicsCustomFieldsSection
          customFields={customFields}
          onChange={updateCustomFields}
        />
      </DesignResumeSection>

      <DesignResumeSection
        value="summary"
        title="Summary"
        subtitle="Write the short intro that appears near the top of your resume."
      >
        <SummarySection
          resumeJson={draft.resumeJson}
          summary={summary}
          onUpdateSummary={updateSummary}
        />
      </DesignResumeSection>

      {ITEM_DEFINITIONS.map((definition) => (
        <DesignResumeListSection
          key={definition.key}
          {...getListSectionProps(definition)}
        />
      ))}
    </Accordion>
  );
}
