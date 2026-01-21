import { z } from "zod";

/**
 * Schema matching the JSON you pasted (the "visible"/"summary"/"date"/"href" format).
 * This is intentionally permissive (passthrough) so small future additions won't break parsing.
 */

export const hrefUrlSchema = z.object({
    href: z.string().default(""),
    label: z.string().default(""),
});

export const pictureEffectsSchema = z.object({
    border: z.boolean().default(false),
    hidden: z.boolean().default(false),
    grayscale: z.boolean().default(false),
});

export const basicsPictureSchema = z.object({
    url: z.string().default(""),
    size: z.number().default(120),
    effects: pictureEffectsSchema,
    aspectRatio: z.number().default(1),
    borderRadius: z.number().default(0),
});

export const customFieldSchema = z
    .object({
        id: z.string().optional(),
        icon: z.string().optional(),
        text: z.string().optional(),
    })
    .passthrough();

export const basicsSchema = z
    .object({
        url: hrefUrlSchema,
        name: z.string(),
        email: z.string().email().or(z.literal("")).default(""),
        phone: z.string().default(""),
        picture: basicsPictureSchema,
        headline: z.string().default(""),
        location: z.string().default(""),
        customFields: z.array(customFieldSchema).default([]),
    })
    .passthrough();

export const metadataCssSchema = z.object({
    value: z.string().default(""),
    visible: z.boolean().default(false),
});

export const metadataPageOptionsSchema = z.object({
    breakLine: z.boolean().default(false),
    pageNumbers: z.boolean().default(false),
});

export const metadataPageSchema = z.object({
    format: z.enum(["a4", "letter"]).default("a4"),
    margin: z.number().default(34),
    options: metadataPageOptionsSchema.default({ breakLine: false, pageNumbers: false }),
});

export const metadataThemeSchema = z.object({
    text: z.string().default("#000000"),
    primary: z.string().default("#475569"),
    background: z.string().default("#ffffff"),
});

/**
 * Your "layout" is shaped like:
 * [
 *   [
 *     [ "summary", "profiles", ... ], // main column ids
 *     [ "skills", "languages" ]       // sidebar column ids
 *   ],
 *   ...
 * ]
 */
export const metadataLayoutSchema = z.array(
    z.tuple([z.array(z.string()), z.array(z.string())])
);

export const metadataTypographySchema = z
    .object({
        font: z.object({
            size: z.number().default(13),
            family: z.string().default("IBM Plex Sans"),
            subset: z.string().default("latin"),
            variants: z.array(z.string()).default(["regular"]),
        }),
        hideIcons: z.boolean().default(false),
        lineHeight: z.number().default(1.75),
        underlineLinks: z.boolean().default(true),
    })
    .passthrough();

export const metadataSchema = z
    .object({
        css: metadataCssSchema,
        page: metadataPageSchema,
        notes: z.string().default(""),
        theme: metadataThemeSchema,
        layout: metadataLayoutSchema.default([]),
        template: z.string().default("onyx"),
        typography: metadataTypographySchema,
    })
    .passthrough();

/** Common section container used by most sections in your JSON */
export const baseSectionSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        columns: z.number().default(1),
        visible: z.boolean().default(true),
        separateLinks: z.boolean().default(true),
        items: z.array(z.unknown()).default([]),
    })
    .passthrough();

/** Item schemas (based on the items you included) */
export const profileItemSchema = z
    .object({
        id: z.string(),
        url: hrefUrlSchema,
        icon: z.string().default(""),
        network: z.string(),
        visible: z.boolean().default(true),
        username: z.string().default(""),
    })
    .passthrough();

export const skillItemSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        level: z.number().default(0),
        visible: z.boolean().default(true),
        keywords: z.array(z.string()).default([]),
        description: z.string().default(""),
    })
    .passthrough();

export const projectItemSchema = z
    .object({
        id: z.string(),
        url: hrefUrlSchema,
        date: z.string().default(""),
        name: z.string(),
        summary: z.string().default(""), // HTML string in your data
        visible: z.boolean().default(true),
        keywords: z.array(z.string()).default([]),
        description: z.string().default(""),
    })
    .passthrough();

export const educationItemSchema = z
    .object({
        id: z.string(),
        url: hrefUrlSchema,
        area: z.string().default(""),
        date: z.string().default(""),
        score: z.string().default(""),
        summary: z.string().default(""), // HTML string
        visible: z.boolean().default(true),
        studyType: z.string().default(""),
        institution: z.string().default(""),
    })
    .passthrough();

export const experienceItemSchema = z
    .object({
        id: z.string(),
        url: hrefUrlSchema,
        date: z.string().default(""),
        company: z.string(),
        summary: z.string().default(""), // HTML string
        visible: z.boolean().default(true),
        location: z.string().default(""),
        position: z.string().default(""),
    })
    .passthrough();

/** Section schemas with typed items */
export const profilesSectionSchema = baseSectionSchema.extend({
    items: z.array(profileItemSchema).default([]),
});

export const skillsSectionSchema = baseSectionSchema.extend({
    items: z.array(skillItemSchema).default([]),
});

export const projectsSectionSchema = baseSectionSchema.extend({
    items: z.array(projectItemSchema).default([]),
});

export const educationSectionSchema = baseSectionSchema.extend({
    items: z.array(educationItemSchema).default([]),
});

export const experienceSectionSchema = baseSectionSchema.extend({
    items: z.array(experienceItemSchema).default([]),
});

/**
 * Your "summary" section is not an items array; it carries "content".
 * Keep it separate.
 */
export const summarySectionSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        columns: z.number().default(1),
        content: z.string().default(""), // HTML string
        visible: z.boolean().default(true),
        separateLinks: z.boolean().default(true),
    })
    .passthrough();

/** Empty-ish sections (you have them as items: []) */
export const emptyItemsSectionSchema = baseSectionSchema.extend({
    items: z.array(z.unknown()).default([]),
});

/**
 * Your "sections" object contains a fixed set of keys, plus `custom: {}`.
 * `custom` is an object with no guaranteed structure in your sample, so passthrough.
 */
export const sectionsSchema = z
    .object({
        awards: emptyItemsSectionSchema,
        custom: z.object({}).passthrough().default({}),
        skills: skillsSectionSchema,
        summary: summarySectionSchema,
        profiles: profilesSectionSchema,
        projects: projectsSectionSchema,
        education: educationSectionSchema,
        interests: emptyItemsSectionSchema,
        languages: emptyItemsSectionSchema,
        volunteer: emptyItemsSectionSchema,
        experience: experienceSectionSchema,
        references: emptyItemsSectionSchema,
        publications: emptyItemsSectionSchema,
        certifications: emptyItemsSectionSchema,
    })
    .passthrough();

/** Top-level schema matching what you pasted */
export const myResumeJsonSchema = z
    .object({
        basics: basicsSchema,
        metadata: metadataSchema,
        sections: sectionsSchema,
    })
    .passthrough();

export type MyResumeJson = z.infer<typeof myResumeJsonSchema>;
