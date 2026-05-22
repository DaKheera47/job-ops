import type { ChatStyleManualLanguage, TypstTheme } from "@shared/types";

export interface ResumeRenderContactItem {
  text: string;
  url?: string | null;
}

export interface ResumeRenderEntry {
  title: string;
  subtitle?: string | null;
  secondaryTitle?: string | null;
  secondarySubtitle?: string | null;
  date?: string | null;
  bullets: string[];
  url?: string | null;
  linkLabel?: string | null;
}

export interface ResumeRenderSkillGroup {
  name: string;
  keywords: string[];
}

export interface ResumeRenderSectionTitles {
  summary: string;
  experience: string;
  education: string;
  projects: string;
  skills: string;
}

export type ResumeRenderSectionKind = "entry" | "project" | "skills";

export interface ResumeRenderBodySection {
  key: string;
  title: string;
  kind: ResumeRenderSectionKind;
  entries: ResumeRenderEntry[];
  skillGroups?: ResumeRenderSkillGroup[];
}

export interface ResumeRenderDocument {
  name: string;
  headline?: string | null;
  contactItems: ResumeRenderContactItem[];
  summary?: string | null;
  body: ResumeRenderBodySection[];
  sectionTitles?: ResumeRenderSectionTitles;
}

export interface RenderResumePdfArgs {
  document: ResumeRenderDocument;
  outputPath: string;
  jobId: string;
  typstTheme?: TypstTheme;
}

export interface ResumeRenderer {
  render(args: RenderResumePdfArgs): Promise<void>;
}

export interface NormalizeResumeJsonOptions {
  language?: ChatStyleManualLanguage;
}
