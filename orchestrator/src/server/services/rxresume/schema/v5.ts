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
    summary: looseObject,
    sections: z
      .object({
        projects: v5ProjectsSectionSchema,
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
