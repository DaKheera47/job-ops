import type { ChatStyleManualLanguage, TypstTheme } from "@shared/types";

export interface LatexResumeContactItem {
  text: string;
  url?: string | null;
  kind?: "phone" | "email" | "website";
}

export interface LatexResumeEntry {
  title: string;
  subtitle?: string | null;
  secondaryTitle?: string | null;
  secondarySubtitle?: string | null;
  date?: string | null;
  bullets: string[];
  url?: string | null;
  linkLabel?: string | null;
}

export interface LatexResumeSkillGroup {
  name: string;
  keywords: string[];
}

export interface LatexResumeProfileItem {
  network: string;
  username?: string | null;
  url?: string | null;
}

export interface LatexResumeCustomFieldItem {
  title?: string | null;
  text: string;
  url?: string | null;
}

export interface LatexResumeLanguageItem {
  language: string;
  fluency?: string | null;
  level?: number | null;
}

export interface LatexResumeInterestItem {
  name: string;
  keywords: string[];
}

export interface LatexResumePicture {
  url?: string | null;
  assetId?: string | null;
  renderPath?: string | null;
  hidden: boolean;
  size: number;
  rotation: number;
  aspectRatio: number;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;
  shadowColor: string;
  shadowWidth: number;
}

export interface LatexResumeSectionTitles {
  profiles: string;
  summary: string;
  customFields: string;
  experience: string;
  education: string;
  projects: string;
  skills: string;
  languages: string;
  interests: string;
  awards: string;
  certifications: string;
  publications: string;
  volunteer: string;
  references: string;
}

export type LatexResumeOrderedSectionKey =
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
  | "references";

export interface LatexResumeDocument {
  name: string;
  headline?: string | null;
  location?: string | null;
  picture?: LatexResumePicture | null;
  contactItems: LatexResumeContactItem[];
  profileItems: LatexResumeProfileItem[];
  customFieldItems: LatexResumeCustomFieldItem[];
  summary?: string | null;
  experience: LatexResumeEntry[];
  education: LatexResumeEntry[];
  projects: LatexResumeEntry[];
  skillGroups: LatexResumeSkillGroup[];
  languages: LatexResumeLanguageItem[];
  interests: LatexResumeInterestItem[];
  awards: LatexResumeEntry[];
  certifications: LatexResumeEntry[];
  publications: LatexResumeEntry[];
  volunteer: LatexResumeEntry[];
  references: LatexResumeEntry[];
  sectionOrder?: LatexResumeOrderedSectionKey[];
  sectionTitles?: LatexResumeSectionTitles;
}

export interface RenderResumePdfArgs {
  document: LatexResumeDocument;
  outputPath: string;
  jobId: string;
  typstTheme?: TypstTheme;
}

export interface ResumeRenderer {
  render(args: RenderResumePdfArgs): Promise<void>;
}

export interface NormalizeResumeJsonToLatexDocumentOptions {
  language?: ChatStyleManualLanguage;
}

export type ResumeRenderContactItem = LatexResumeContactItem;
export type ResumeRenderEntry = LatexResumeEntry;
export type ResumeRenderSkillGroup = LatexResumeSkillGroup;
export type ResumeRenderSectionTitles = LatexResumeSectionTitles;
export type ResumeRenderDocument = LatexResumeDocument;
export type NormalizeResumeJsonOptions =
  NormalizeResumeJsonToLatexDocumentOptions;
