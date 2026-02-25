import { z } from "zod";

const looseObject = z.object({}).passthrough();

const v5UrlSchema = z
  .object({
    url: z.string(),
    label: z.string(),
  })
  .passthrough();

const v5ProjectItemSchema = z
  .object({
    id: z.string(),
    hidden: z.boolean(),
    name: z.string(),
    period: z.string(),
    website: v5UrlSchema,
    description: z.string(),
  })
  .passthrough();

const v5SectionBaseSchema = z
  .object({
    title: z.string(),
    columns: z.number(),
    hidden: z.boolean(),
  })
  .passthrough();

const v5ProjectsSectionSchema = v5SectionBaseSchema.extend({
  items: z.array(v5ProjectItemSchema),
});

const v5SummarySectionSchema = v5SectionBaseSchema.extend({
  content: z.string(),
});

const v5SkillItemSchema = z
  .object({
    id: z.string(),
    hidden: z.boolean(),
    icon: z.string(),
    name: z.string(),
    proficiency: z.string(),
    level: z.number(),
    keywords: z.array(z.string()),
  })
  .passthrough();

const v5SkillsSectionSchema = v5SectionBaseSchema.extend({
  items: z.array(v5SkillItemSchema),
});

export const v5ResumeDataSchema = z
  .object({
    picture: looseObject,
    basics: z
      .object({
        name: z.string(),
        headline: z.string(),
        email: z.string(),
        phone: z.string(),
        location: z.string(),
        website: v5UrlSchema,
        customFields: z.array(looseObject),
      })
      .passthrough(),
    summary: v5SummarySectionSchema,
    sections: z
      .object({
        projects: v5ProjectsSectionSchema,
        skills: v5SkillsSectionSchema,
      })
      .passthrough(),
    customSections: z.array(looseObject),
    metadata: looseObject,
  })
  .passthrough();

export function parseV5ResumeData(data: unknown) {
  return v5ResumeDataSchema.parse(data);
}

export function safeParseV5ResumeData(data: unknown) {
  return v5ResumeDataSchema.safeParse(data);
}
