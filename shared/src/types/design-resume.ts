import type { RxResumeMode } from "./settings";

export type ReactiveResumeV5LooseObject = Record<string, unknown>;

export interface ReactiveResumeV5Url extends ReactiveResumeV5LooseObject {
  url: string;
  label: string;
}

export interface ReactiveResumeV5Options extends ReactiveResumeV5LooseObject {
  showLinkInTitle: boolean;
}

export interface ReactiveResumeV5Role extends ReactiveResumeV5LooseObject {
  id: string;
  position: string;
  period: string;
  description: string;
}

export interface ReactiveResumeV5CustomField
  extends ReactiveResumeV5LooseObject {
  id: string;
  icon: string;
  text: string;
  link: string;
}

export interface ReactiveResumeV5Picture extends ReactiveResumeV5LooseObject {
  hidden: boolean;
  url: string;
  size: number;
  rotation: number;
  aspectRatio: number;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;
  shadowColor: string;
  shadowWidth: number;
}

export interface ReactiveResumeV5Basics extends ReactiveResumeV5LooseObject {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: ReactiveResumeV5Url;
  customFields: ReactiveResumeV5CustomField[];
}

export interface ReactiveResumeV5SectionBase
  extends ReactiveResumeV5LooseObject {
  title: string;
  columns: number;
  hidden: boolean;
}

export interface ReactiveResumeV5SummarySection
  extends ReactiveResumeV5SectionBase {
  content: string;
}

export interface ReactiveResumeV5BaseItem extends ReactiveResumeV5LooseObject {
  id: string;
  hidden: boolean;
  options?: ReactiveResumeV5Options;
}

export interface ReactiveResumeV5SummaryItem extends ReactiveResumeV5BaseItem {
  content: string;
}

export interface ReactiveResumeV5ProfileItem extends ReactiveResumeV5BaseItem {
  icon: string;
  network: string;
  username: string;
  website: ReactiveResumeV5Url;
}

export interface ReactiveResumeV5ExperienceItem
  extends ReactiveResumeV5BaseItem {
  company: string;
  position: string;
  location: string;
  period: string;
  website: ReactiveResumeV5Url;
  description: string;
  roles: ReactiveResumeV5Role[];
}

export interface ReactiveResumeV5EducationItem
  extends ReactiveResumeV5BaseItem {
  school: string;
  degree: string;
  area: string;
  grade: string;
  location: string;
  period: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5ProjectItem extends ReactiveResumeV5BaseItem {
  name: string;
  period: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5SkillItem extends ReactiveResumeV5BaseItem {
  icon: string;
  name: string;
  proficiency: string;
  level: number;
  keywords: string[];
}

export interface ReactiveResumeV5LanguageItem extends ReactiveResumeV5BaseItem {
  language: string;
  fluency: string;
  level: number;
}

export interface ReactiveResumeV5InterestItem extends ReactiveResumeV5BaseItem {
  icon: string;
  name: string;
  keywords: string[];
}

export interface ReactiveResumeV5AwardItem extends ReactiveResumeV5BaseItem {
  title: string;
  awarder: string;
  date: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5CertificationItem
  extends ReactiveResumeV5BaseItem {
  title: string;
  issuer: string;
  date: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5PublicationItem
  extends ReactiveResumeV5BaseItem {
  title: string;
  publisher: string;
  date: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5VolunteerItem
  extends ReactiveResumeV5BaseItem {
  organization: string;
  location: string;
  period: string;
  website: ReactiveResumeV5Url;
  description: string;
}

export interface ReactiveResumeV5ReferenceItem
  extends ReactiveResumeV5BaseItem {
  name: string;
  position: string;
  website: ReactiveResumeV5Url;
  phone: string;
  description: string;
}

export interface ReactiveResumeV5CoverLetterItem
  extends ReactiveResumeV5BaseItem {
  recipient: string;
  content: string;
}

export interface ReactiveResumeV5ItemSection<TItem>
  extends ReactiveResumeV5SectionBase {
  items: TItem[];
}

export type ReactiveResumeV5SectionType =
  | "summary"
  | "profiles"
  | "experience"
  | "education"
  | "projects"
  | "skills"
  | "languages"
  | "interests"
  | "awards"
  | "certifications"
  | "publications"
  | "volunteer"
  | "references"
  | "cover-letter";

export type ReactiveResumeV5CustomSectionItem =
  | ReactiveResumeV5CoverLetterItem
  | ReactiveResumeV5SummaryItem
  | ReactiveResumeV5ProfileItem
  | ReactiveResumeV5ExperienceItem
  | ReactiveResumeV5EducationItem
  | ReactiveResumeV5ProjectItem
  | ReactiveResumeV5SkillItem
  | ReactiveResumeV5LanguageItem
  | ReactiveResumeV5InterestItem
  | ReactiveResumeV5AwardItem
  | ReactiveResumeV5CertificationItem
  | ReactiveResumeV5PublicationItem
  | ReactiveResumeV5VolunteerItem
  | ReactiveResumeV5ReferenceItem;

export interface ReactiveResumeV5CustomSection
  extends ReactiveResumeV5SectionBase {
  id: string;
  type: ReactiveResumeV5SectionType;
  items: ReactiveResumeV5CustomSectionItem[];
}

export interface ReactiveResumeV5MetadataLayoutPage
  extends ReactiveResumeV5LooseObject {
  fullWidth: boolean;
  main: string[];
  sidebar: string[];
}

export interface ReactiveResumeV5MetadataLayout
  extends ReactiveResumeV5LooseObject {
  sidebarWidth: number;
  pages: ReactiveResumeV5MetadataLayoutPage[];
}

export interface ReactiveResumeV5MetadataCss
  extends ReactiveResumeV5LooseObject {
  enabled: boolean;
  value: string;
}

export type ReactiveResumeV5PageFormat = "a4" | "letter" | "free-form";

export interface ReactiveResumeV5MetadataPage
  extends ReactiveResumeV5LooseObject {
  gapX: number;
  gapY: number;
  marginX: number;
  marginY: number;
  format: ReactiveResumeV5PageFormat;
  locale: string;
  hideIcons: boolean;
}

export type ReactiveResumeV5LevelType =
  | "hidden"
  | "circle"
  | "square"
  | "rectangle"
  | "rectangle-full"
  | "progress-bar"
  | "icon";

export interface ReactiveResumeV5MetadataLevel
  extends ReactiveResumeV5LooseObject {
  icon: string;
  type: ReactiveResumeV5LevelType;
}

export interface ReactiveResumeV5MetadataColors
  extends ReactiveResumeV5LooseObject {
  primary: string;
  text: string;
  background: string;
}

export interface ReactiveResumeV5MetadataTypographyBlock
  extends ReactiveResumeV5LooseObject {
  fontFamily: string;
  fontWeights: string[];
  fontSize: number;
  lineHeight: number;
}

export interface ReactiveResumeV5MetadataDesign
  extends ReactiveResumeV5LooseObject {
  level: ReactiveResumeV5MetadataLevel;
  colors: ReactiveResumeV5MetadataColors;
}

export interface ReactiveResumeV5MetadataTypography
  extends ReactiveResumeV5LooseObject {
  body: ReactiveResumeV5MetadataTypographyBlock;
  heading: ReactiveResumeV5MetadataTypographyBlock;
}

export interface ReactiveResumeV5Metadata extends ReactiveResumeV5LooseObject {
  template: string;
  layout: ReactiveResumeV5MetadataLayout;
  css: ReactiveResumeV5MetadataCss;
  page: ReactiveResumeV5MetadataPage;
  design: ReactiveResumeV5MetadataDesign;
  typography: ReactiveResumeV5MetadataTypography;
  notes: string;
}

export interface ReactiveResumeV5Sections extends ReactiveResumeV5LooseObject {
  profiles: ReactiveResumeV5ItemSection<ReactiveResumeV5ProfileItem>;
  experience: ReactiveResumeV5ItemSection<ReactiveResumeV5ExperienceItem>;
  education: ReactiveResumeV5ItemSection<ReactiveResumeV5EducationItem>;
  projects: ReactiveResumeV5ItemSection<ReactiveResumeV5ProjectItem>;
  skills: ReactiveResumeV5ItemSection<ReactiveResumeV5SkillItem>;
  languages: ReactiveResumeV5ItemSection<ReactiveResumeV5LanguageItem>;
  interests: ReactiveResumeV5ItemSection<ReactiveResumeV5InterestItem>;
  awards: ReactiveResumeV5ItemSection<ReactiveResumeV5AwardItem>;
  certifications: ReactiveResumeV5ItemSection<ReactiveResumeV5CertificationItem>;
  publications: ReactiveResumeV5ItemSection<ReactiveResumeV5PublicationItem>;
  volunteer: ReactiveResumeV5ItemSection<ReactiveResumeV5VolunteerItem>;
  references: ReactiveResumeV5ItemSection<ReactiveResumeV5ReferenceItem>;
}

export interface ReactiveResumeV5Document extends ReactiveResumeV5LooseObject {
  picture: ReactiveResumeV5Picture;
  basics: ReactiveResumeV5Basics;
  summary: ReactiveResumeV5SummarySection;
  sections: ReactiveResumeV5Sections;
  customSections: ReactiveResumeV5CustomSection[];
  metadata: ReactiveResumeV5Metadata;
}

export type DesignResumeJson = ReactiveResumeV5Document;

export interface DesignResumeAsset {
  id: string;
  documentId: string;
  kind: "picture";
  originalName: string;
  mimeType: string;
  byteSize: number;
  storagePath: string;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignResumeDocument {
  id: string;
  title: string;
  resumeJson: DesignResumeJson;
  revision: number;
  sourceResumeId: string | null;
  sourceMode: RxResumeMode | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assets: DesignResumeAsset[];
}

export interface DesignResumeStatusResponse {
  exists: boolean;
  documentId: string | null;
  updatedAt: string | null;
}

export interface DesignResumeImportResult {
  document: DesignResumeDocument;
}

export interface DesignResumePatchRequest {
  baseRevision: number;
  document?: DesignResumeJson;
  operations?: Array<{
    op: "add" | "remove" | "replace" | "move" | "copy" | "test";
    path: string;
    from?: string;
    value?: unknown;
  }>;
}

export interface DesignResumeExportResponse {
  fileName: string;
  document: DesignResumeJson;
}

export interface DesignResumePdfResponse {
  fileName: string;
  pdfUrl: string;
  generatedAt: string;
}
