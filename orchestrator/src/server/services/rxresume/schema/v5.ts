import { z } from "zod";

const templateNames = [
  "azurill",
  "bronzor",
  "chikorita",
  "ditgar",
  "ditto",
  "gengar",
  "glalie",
  "kakuna",
  "lapras",
  "leafish",
  "onyx",
  "pikachu",
  "rhyhorn",
] as const;

export const templateSchema = z.enum(templateNames);

export const iconSchema = z.string();

export const itemOptionsSchema = z
  .object({
    showLinkInTitle: z.boolean().catch(false),
  })
  .catch({ showLinkInTitle: false });

export const urlSchema = z.object({
  url: z.string(),
  label: z.string(),
});

export const pictureSchema = z.object({
  hidden: z.boolean(),
  url: z.string(),
  size: z.number().min(32).max(512),
  rotation: z.number().min(0).max(360),
  aspectRatio: z.number().min(0.5).max(2.5),
  borderRadius: z.number().min(0).max(100),
  borderColor: z.string(),
  borderWidth: z.number().min(0),
  shadowColor: z.string(),
  shadowWidth: z.number().min(0),
});

export const customFieldSchema = z.object({
  id: z.string(),
  icon: iconSchema,
  text: z.string(),
  link: z.string().catch(""),
});

export const basicsSchema = z.object({
  name: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  website: urlSchema,
  customFields: z.array(customFieldSchema),
});

export const summarySchema = z.object({
  title: z.string(),
  columns: z.number(),
  hidden: z.boolean(),
  content: z.string(),
});

export const baseItemSchema = z.object({
  id: z.string(),
  hidden: z.boolean(),
  options: itemOptionsSchema.optional(),
});

export const summaryItemSchema = baseItemSchema.extend({
  content: z.string(),
});

export type SummaryItem = z.infer<typeof summaryItemSchema>;

export const awardItemSchema = baseItemSchema.extend({
  title: z.string().min(1),
  awarder: z.string(),
  date: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const certificationItemSchema = baseItemSchema.extend({
  title: z.string().min(1),
  issuer: z.string(),
  date: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const educationItemSchema = baseItemSchema.extend({
  school: z.string().min(1),
  degree: z.string(),
  area: z.string(),
  grade: z.string(),
  location: z.string(),
  period: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const roleItemSchema = z.object({
  id: z.string(),
  position: z.string(),
  period: z.string(),
  description: z.string(),
});

export type RoleItem = z.infer<typeof roleItemSchema>;

export const experienceItemSchema = baseItemSchema.extend({
  company: z.string().min(1),
  position: z.string(),
  location: z.string(),
  period: z.string(),
  website: urlSchema,
  description: z.string(),
  roles: z.array(roleItemSchema).catch([]),
});

export const interestItemSchema = baseItemSchema.extend({
  icon: iconSchema,
  name: z.string().min(1),
  keywords: z.array(z.string()).catch([]),
});

export const languageItemSchema = baseItemSchema.extend({
  language: z.string().min(1),
  fluency: z.string(),
  level: z.number().min(0).max(5).catch(0),
});

export const profileItemSchema = baseItemSchema.extend({
  icon: iconSchema,
  network: z.string().min(1),
  username: z.string(),
  website: urlSchema,
});

export const projectItemSchema = baseItemSchema.extend({
  name: z.string().min(1),
  period: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const publicationItemSchema = baseItemSchema.extend({
  title: z.string().min(1),
  publisher: z.string(),
  date: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const referenceItemSchema = baseItemSchema.extend({
  name: z.string().min(1),
  position: z.string(),
  website: urlSchema,
  phone: z.string(),
  description: z.string(),
});

export const skillItemSchema = baseItemSchema.extend({
  icon: iconSchema,
  name: z.string().min(1),
  proficiency: z.string(),
  level: z.number().min(0).max(5).catch(0),
  keywords: z.array(z.string()).catch([]),
});

export const volunteerItemSchema = baseItemSchema.extend({
  organization: z.string().min(1),
  location: z.string(),
  period: z.string(),
  website: urlSchema,
  description: z.string(),
});

export const coverLetterItemSchema = baseItemSchema.extend({
  recipient: z.string(),
  content: z.string(),
});

export type CoverLetterItem = z.infer<typeof coverLetterItemSchema>;

export const baseSectionSchema = z.object({
  title: z.string(),
  columns: z.number(),
  hidden: z.boolean(),
});

export const awardsSectionSchema = baseSectionSchema.extend({
  items: z.array(awardItemSchema),
});

export const certificationsSectionSchema = baseSectionSchema.extend({
  items: z.array(certificationItemSchema),
});

export const educationSectionSchema = baseSectionSchema.extend({
  items: z.array(educationItemSchema),
});

export const experienceSectionSchema = baseSectionSchema.extend({
  items: z.array(experienceItemSchema),
});

export const interestsSectionSchema = baseSectionSchema.extend({
  items: z.array(interestItemSchema),
});

export const languagesSectionSchema = baseSectionSchema.extend({
  items: z.array(languageItemSchema),
});

export const profilesSectionSchema = baseSectionSchema.extend({
  items: z.array(profileItemSchema),
});

export const projectsSectionSchema = baseSectionSchema.extend({
  items: z.array(projectItemSchema),
});

export const publicationsSectionSchema = baseSectionSchema.extend({
  items: z.array(publicationItemSchema),
});

export const referencesSectionSchema = baseSectionSchema.extend({
  items: z.array(referenceItemSchema),
});

export const skillsSectionSchema = baseSectionSchema.extend({
  items: z.array(skillItemSchema),
});

export const volunteerSectionSchema = baseSectionSchema.extend({
  items: z.array(volunteerItemSchema),
});

export const sectionsSchema = z.object({
  profiles: profilesSectionSchema,
  experience: experienceSectionSchema,
  education: educationSectionSchema,
  projects: projectsSectionSchema,
  skills: skillsSectionSchema,
  languages: languagesSectionSchema,
  interests: interestsSectionSchema,
  awards: awardsSectionSchema,
  certifications: certificationsSectionSchema,
  publications: publicationsSectionSchema,
  volunteer: volunteerSectionSchema,
  references: referencesSectionSchema,
});

export type SectionType = keyof z.infer<typeof sectionsSchema>;
export type SectionData<T extends SectionType = SectionType> = z.infer<
  typeof sectionsSchema
>[T];
export type SectionItem<T extends SectionType = SectionType> =
  SectionData<T>["items"][number];

export const sectionTypeSchema = z.enum([
  "summary",
  "profiles",
  "experience",
  "education",
  "projects",
  "skills",
  "languages",
  "interests",
  "awards",
  "certifications",
  "publications",
  "volunteer",
  "references",
  "cover-letter",
]);

export type CustomSectionType = z.infer<typeof sectionTypeSchema>;

export const customSectionItemSchema = z.union([
  coverLetterItemSchema,
  summaryItemSchema,
  profileItemSchema,
  experienceItemSchema,
  educationItemSchema,
  projectItemSchema,
  skillItemSchema,
  languageItemSchema,
  interestItemSchema,
  awardItemSchema,
  certificationItemSchema,
  publicationItemSchema,
  volunteerItemSchema,
  referenceItemSchema,
]);

export type CustomSectionItem = z.infer<typeof customSectionItemSchema>;

export const customSectionSchema = baseSectionSchema.extend({
  id: z.string(),
  type: sectionTypeSchema,
  items: z.array(customSectionItemSchema),
});

export type CustomSection = z.infer<typeof customSectionSchema>;

export const customSectionsSchema = z.array(customSectionSchema);

export const fontWeightSchema = z.enum([
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
]);

export const typographyItemSchema = z.object({
  fontFamily: z.string(),
  fontWeights: z.array(fontWeightSchema).catch(["400"]),
  fontSize: z.number().min(6).max(24).catch(11),
  lineHeight: z.number().min(0.5).max(4).catch(1.5),
});

export const pageLayoutSchema = z.object({
  fullWidth: z.boolean(),
  main: z.array(z.string()),
  sidebar: z.array(z.string()),
});

export const layoutSchema = z.object({
  sidebarWidth: z.number().min(10).max(50).catch(35),
  pages: z.array(pageLayoutSchema),
});

export const cssSchema = z.object({
  enabled: z.boolean(),
  value: z.string(),
});

export const pageSchema = z.object({
  gapX: z.number().min(0),
  gapY: z.number().min(0),
  marginX: z.number().min(0),
  marginY: z.number().min(0),
  format: z.enum(["a4", "letter", "free-form"]).catch("a4"),
  locale: z.string().catch("en-US"),
  hideIcons: z.boolean().catch(false),
});

export const levelDesignSchema = z.object({
  icon: iconSchema,
  type: z.enum([
    "hidden",
    "circle",
    "square",
    "rectangle",
    "rectangle-full",
    "progress-bar",
    "icon",
  ]),
});

export const colorDesignSchema = z.object({
  primary: z.string(),
  text: z.string(),
  background: z.string(),
});

export const designSchema = z.object({
  level: levelDesignSchema,
  colors: colorDesignSchema,
});

export const typographySchema = z.object({
  body: typographyItemSchema,
  heading: typographyItemSchema,
});

export const metadataSchema = z.object({
  template: templateSchema.catch("onyx"),
  layout: layoutSchema,
  css: cssSchema,
  page: pageSchema,
  design: designSchema,
  typography: typographySchema,
  notes: z.string(),
});

export const v5ResumeDataSchema = z.object({
  picture: pictureSchema,
  basics: basicsSchema,
  summary: summarySchema,
  sections: sectionsSchema,
  customSections: customSectionsSchema,
  metadata: metadataSchema,
});

export type V5ResumeData = z.infer<typeof v5ResumeDataSchema>;

export const defaultV5ResumeData: V5ResumeData = {
  picture: {
    hidden: false,
    url: "",
    size: 80,
    rotation: 0,
    aspectRatio: 1,
    borderRadius: 0,
    borderColor: "rgba(0, 0, 0, 0.5)",
    borderWidth: 0,
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowWidth: 0,
  },
  basics: {
    name: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    website: { url: "", label: "" },
    customFields: [],
  },
  summary: {
    title: "",
    columns: 1,
    hidden: false,
    content: "",
  },
  sections: {
    profiles: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    experience: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    education: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    projects: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    skills: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    languages: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    interests: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    awards: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    certifications: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    publications: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    volunteer: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
    references: {
      title: "",
      columns: 1,
      hidden: false,
      items: [],
    },
  },
  customSections: [],
  metadata: {
    template: "onyx",
    layout: {
      sidebarWidth: 35,
      pages: [
        {
          fullWidth: false,
          main: [
            "profiles",
            "summary",
            "education",
            "experience",
            "projects",
            "volunteer",
            "references",
          ],
          sidebar: [
            "skills",
            "certifications",
            "awards",
            "languages",
            "interests",
            "publications",
          ],
        },
      ],
    },
    css: { enabled: false, value: "" },
    page: {
      gapX: 4,
      gapY: 6,
      marginX: 14,
      marginY: 12,
      format: "a4",
      locale: "en-US",
      hideIcons: false,
    },
    design: {
      colors: {
        primary: "rgba(220, 38, 38, 1)",
        text: "rgba(0, 0, 0, 1)",
        background: "rgba(255, 255, 255, 1)",
      },
      level: {
        icon: "star",
        type: "circle",
      },
    },
    typography: {
      body: {
        fontFamily: "IBM Plex Serif",
        fontWeights: ["400", "500"],
        fontSize: 10,
        lineHeight: 1.5,
      },
      heading: {
        fontFamily: "IBM Plex Serif",
        fontWeights: ["600"],
        fontSize: 14,
        lineHeight: 1.5,
      },
    },
    notes: "",
  },
};

export function parseV5ResumeData(input: unknown): V5ResumeData {
  return v5ResumeDataSchema.parse(input);
}

export function safeParseV5ResumeData(input: unknown) {
  return v5ResumeDataSchema.safeParse(input);
}
