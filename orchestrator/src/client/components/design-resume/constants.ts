import type { SectionWorkspaceGroup } from "@client/components/section-workspace/SectionWorkspace";
import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import {
  Award,
  BookOpen,
  BriefcaseBusiness,
  Eye,
  FileText,
  Folder,
  GraduationCap,
  HeartHandshake,
  ImageIcon,
  Languages,
  Link2,
  ListPlus,
  type LucideIcon,
  Quote,
  ScrollText,
  Sparkles,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import { bucketCount } from "@/lib/analytics";
import { ITEM_DEFINITIONS } from "./definitions";
import { asArray, asRecord, toText } from "./utils";

export type DesignResumeSectionId = string;
export type DesignResumeGroupId = "profile" | "sections";
export type DesignResumeNavItem = {
  id: DesignResumeSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  sectionId?: DesignResumeSectionId | null;
};
export type DesignResumeIconGroupId = "preview" | DesignResumeGroupId;
export type DesignResumeNavGroup = {
  id: DesignResumeIconGroupId;
  label: string;
  items: DesignResumeNavItem[];
};
export type DesignResumeMobileView = "edit" | "preview";

export const DESIGN_RESUME_PAGE_MAIN_CLASS_NAME =
  "flex min-h-0 flex-1 flex-col space-y-0 overflow-hidden py-3 pb-3";

export const SECTION_ICON_BY_ID: Record<string, LucideIcon> = {
  profiles: Link2,
  experience: BriefcaseBusiness,
  education: GraduationCap,
  projects: Folder,
  skills: Wrench,
  languages: Languages,
  interests: Sparkles,
  awards: Trophy,
  certifications: Award,
  publications: ScrollText,
  volunteer: HeartHandshake,
  references: Quote,
};

export const DESIGN_RESUME_PROFILE_SECTIONS: SectionWorkspaceGroup<
  DesignResumeGroupId,
  DesignResumeSectionId
>["items"] = [
  {
    id: "basics",
    label: "Contact",
    description: "Name, headline, and contact details.",
    searchTerms: ["basics", "headline", "email", "phone", "location"],
  },
  {
    id: "summary",
    label: "Summary",
    description:
      "Short intro shown near the top of your resume. Rewritten during Job Tailoring for each application.",
    searchTerms: ["intro", "profile", "overview"],
  },
  {
    id: "picture",
    label: "Picture",
    description: "Resume photo and picture presentation.",
    searchTerms: ["photo", "avatar", "image"],
  },
  {
    id: "basics-custom-fields",
    label: "Custom Fields",
    description: "Extra links or short details near your contact info.",
    searchTerms: ["links", "custom", "details"],
  },
];

export const DESIGN_RESUME_ICON_GROUPS: DesignResumeNavGroup[] = [
  {
    id: "preview",
    label: "Preview",
    items: [
      {
        id: "live-preview",
        label: "Live preview",
        description: "See a preview of your resume as you edit it.",
        icon: Eye,
        sectionId: null,
      },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    items: [
      {
        id: "basics",
        label: "Contact",
        description: "Name, headline, and contact details.",
        icon: UserRound,
      },
      {
        id: "summary",
        label: "Summary",
        description:
          "Short intro shown near the top of your resume. Rewritten during Job Tailoring for each application.",
        icon: FileText,
      },
      {
        id: "picture",
        label: "Picture",
        description: "Resume photo and picture presentation.",
        icon: ImageIcon,
      },
      {
        id: "basics-custom-fields",
        label: "Custom Fields",
        description: "Extra links or short details near your contact info.",
        icon: ListPlus,
      },
    ],
  },
  {
    id: "sections",
    label: "Resume Sections",
    items: ITEM_DEFINITIONS.map((definition) => ({
      id: definition.key,
      label: definition.title,
      description: definition.description,
      icon: SECTION_ICON_BY_ID[definition.key] ?? BookOpen,
    })),
  },
];

export const DESIGN_RESUME_NAV_GROUPS: SectionWorkspaceGroup<
  DesignResumeGroupId,
  DesignResumeSectionId
>[] = [
  {
    id: "profile",
    label: "Profile",
    items: DESIGN_RESUME_PROFILE_SECTIONS,
  },
  {
    id: "sections",
    label: "Resume Sections",
    items: ITEM_DEFINITIONS.map((definition) => ({
      id: definition.key,
      label: definition.title,
      description: definition.description,
      searchTerms: [
        definition.singularTitle,
        definition.primaryField,
        definition.secondaryField ?? "",
      ].filter(Boolean),
    })),
  },
];

export const allDesignResumeSections = DESIGN_RESUME_NAV_GROUPS.flatMap(
  (group) => group.items,
);

export function getSectionWorkspaceCopy(
  activeSection: DesignResumeSectionId | null,
  draft: DesignResumeDocument | null,
) {
  const activeSectionMeta = activeSection
    ? allDesignResumeSections.find((item) => item.id === activeSection)
    : null;
  if (!activeSectionMeta) return null;

  if (activeSection !== "basics-custom-fields" || !draft) {
    return activeSectionMeta;
  }

  const resumeJson = draft.resumeJson as Record<string, unknown>;
  const basics = asRecord(resumeJson.basics) ?? {};
  const customFieldsTitle =
    toText(basics.customFieldsTitle).trim() || activeSectionMeta.label;

  return {
    ...activeSectionMeta,
    label: customFieldsTitle,
  };
}

const DESIGN_RESUME_ICON_ITEM_BY_SECTION_ID = new Map(
  DESIGN_RESUME_ICON_GROUPS.flatMap((group) =>
    group.items.map((item) => [
      item.sectionId === undefined ? item.id : item.sectionId,
      item,
    ]),
  ),
);

export function getDesignResumeSectionIcon(sectionId: DesignResumeSectionId) {
  return DESIGN_RESUME_ICON_ITEM_BY_SECTION_ID.get(sectionId)?.icon ?? BookOpen;
}

export function bucketResumeSectionItemCounts(document: DesignResumeJson): {
  sectionCountBucket: string;
  itemCountBucket: string;
} {
  const sections = asRecord(document.sections) ?? {};
  const sectionCount = Object.keys(sections).length;
  const itemCount = Object.values(sections).reduce<number>((count, section) => {
    const sectionRecord = asRecord(section) ?? {};
    return count + asArray(sectionRecord.items).length;
  }, 0);
  return {
    sectionCountBucket: bucketCount(sectionCount),
    itemCountBucket: bucketCount(itemCount),
  };
}

export function getImportFileType(file: File): "pdf" | "docx" | "unknown" {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".pdf")) return "pdf";
  if (fileName.endsWith(".docx")) return "docx";
  return "unknown";
}

export function getDeviceLayout(): "mobile" | "desktop" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "desktop";
  return window.matchMedia("(max-width: 639px)").matches ? "mobile" : "desktop";
}
