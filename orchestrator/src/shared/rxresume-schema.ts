// combined types from: https://github.com/amruthpillai/reactive-resume/tree/v4.5.5/libs/schema/src

import { z } from "zod";

// --- Shared ---

export type FilterKeys<T, Condition> = {
    [Key in keyof T]: T[Key] extends Condition ? Key : never;
}[keyof T];

export const idSchema = z
    .string()
    .cuid2()
    .describe("Unique identifier for the item (CUID2 format)");

export const itemSchema = z.object({
    id: idSchema,
    visible: z.boolean(),
});

export type Item = z.infer<typeof itemSchema>;

export const defaultItem: Item = {
    id: "",
    visible: true,
};

export const urlSchema = z.object({
    label: z.string(),
    href: z.literal("").or(z.string().url()),
});

export type URL = z.infer<typeof urlSchema>;

export const defaultUrl: URL = {
    label: "",
    href: "",
};

// --- Basics ---

export const customFieldSchema = z.object({
    id: z.string().cuid2(),
    icon: z.string(),
    name: z.string(),
    value: z.string(),
});

export type CustomField = z.infer<typeof customFieldSchema>;

export const basicsSchema = z.object({
    name: z.string(),
    headline: z.string(),
    email: z.literal("").or(z.string().email()),
    phone: z.string(),
    location: z.string(),
    url: urlSchema,
    customFields: z.array(customFieldSchema),
    picture: z.object({
        url: z.string(),
        size: z.number().default(64),
        aspectRatio: z.number().default(1),
        borderRadius: z.number().default(0),
        effects: z.object({
            hidden: z.boolean().default(false),
            border: z.boolean().default(false),
            grayscale: z.boolean().default(false),
        }),
    }),
});

export type Basics = z.infer<typeof basicsSchema>;

export const defaultBasics: Basics = {
    name: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    url: defaultUrl,
    customFields: [],
    picture: {
        url: "",
        size: 64,
        aspectRatio: 1,
        borderRadius: 0,
        effects: {
            hidden: false,
            border: false,
            grayscale: false,
        },
    },
};

// --- Metadata ---

export const defaultLayout = [
    [
        ["profiles", "summary", "experience", "education", "projects", "volunteer", "references"],
        ["skills", "interests", "certifications", "awards", "publications", "languages"],
    ],
];

export const metadataSchema = z.object({
    template: z.string().default("rhyhorn"),
    layout: z.array(z.array(z.array(z.string()))).default(defaultLayout), // pages -> columns -> sections
    css: z.object({
        value: z.string().default("* {\n\toutline: 1px solid #000;\n\toutline-offset: 4px;\n}"),
        visible: z.boolean().default(false),
    }),
    page: z.object({
        margin: z.number().default(18),
        format: z.enum(["a4", "letter"]).default("a4"),
        options: z.object({
            breakLine: z.boolean().default(true),
            pageNumbers: z.boolean().default(true),
        }),
    }),
    theme: z.object({
        background: z.string().default("#ffffff"),
        text: z.string().default("#000000"),
        primary: z.string().default("#dc2626"),
    }),
    typography: z.object({
        font: z.object({
            family: z.string().default("IBM Plex Serif"),
            subset: z.string().default("latin"),
            variants: z.array(z.string()).default(["regular"]),
            size: z.number().default(14),
        }),
        lineHeight: z.number().default(1.5),
        hideIcons: z.boolean().default(false),
        underlineLinks: z.boolean().default(true),
    }),
    notes: z.string().default(""),
});

export type Metadata = z.infer<typeof metadataSchema>;

export const defaultMetadata: Metadata = {
    template: "rhyhorn",
    layout: defaultLayout,
    css: {
        value: "* {\n\toutline: 1px solid #000;\n\toutline-offset: 4px;\n}",
        visible: false,
    },
    page: {
        margin: 18,
        format: "a4",
        options: {
            breakLine: true,
            pageNumbers: true,
        },
    },
    theme: {
        background: "#ffffff",
        text: "#000000",
        primary: "#dc2626",
    },
    typography: {
        font: {
            family: "IBM Plex Serif",
            subset: "latin",
            variants: ["regular", "italic", "600"],
            size: 14,
        },
        lineHeight: 1.5,
        hideIcons: false,
        underlineLinks: true,
    },
    notes: "",
};

// --- Sections ---

// Award
export const awardSchema = itemSchema.extend({
    title: z.string().min(1),
    awarder: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Award = z.infer<typeof awardSchema>;

export const defaultAward: Award = {
    ...defaultItem,
    title: "",
    awarder: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// Certification
export const certificationSchema = itemSchema.extend({
    name: z.string().min(1),
    issuer: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Certification = z.infer<typeof certificationSchema>;

export const defaultCertification: Certification = {
    ...defaultItem,
    name: "",
    issuer: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// Custom Section
export const customSectionSchema = itemSchema.extend({
    name: z.string(),
    description: z.string(),
    date: z.string(),
    location: z.string(),
    summary: z.string(),
    keywords: z.array(z.string()).default([]),
    url: urlSchema,
});

export type CustomSection = z.infer<typeof customSectionSchema>;

export const defaultCustomSection: CustomSection = {
    ...defaultItem,
    name: "",
    description: "",
    date: "",
    location: "",
    summary: "",
    keywords: [],
    url: defaultUrl,
};

// Education
export const educationSchema = itemSchema.extend({
    institution: z.string().min(1),
    studyType: z.string(),
    area: z.string(),
    score: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Education = z.infer<typeof educationSchema>;

export const defaultEducation: Education = {
    ...defaultItem,
    id: "",
    institution: "",
    studyType: "",
    area: "",
    score: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// Experience
export const experienceSchema = itemSchema.extend({
    company: z.string().min(1),
    position: z.string(),
    location: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Experience = z.infer<typeof experienceSchema>;

export const defaultExperience: Experience = {
    ...defaultItem,
    company: "",
    position: "",
    location: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// Interest
export const interestSchema = itemSchema.extend({
    name: z.string().min(1),
    keywords: z.array(z.string()).default([]),
});

export type Interest = z.infer<typeof interestSchema>;

export const defaultInterest: Interest = {
    ...defaultItem,
    name: "",
    keywords: [],
};

// Language
export const languageSchema = itemSchema.extend({
    name: z.string().min(1),
    description: z.string(),
    level: z.coerce.number().min(0).max(5).default(1),
});

export type Language = z.infer<typeof languageSchema>;

export const defaultLanguage: Language = {
    ...defaultItem,
    name: "",
    description: "",
    level: 1,
};

// Profile
export const profileSchema = itemSchema.extend({
    network: z.string().min(1),
    username: z.string().min(1),
    icon: z
        .string()
        .describe(
            'Slug for the icon from https://simpleicons.org. For example, "github", "linkedin", etc.',
        ),
    url: urlSchema,
});

export type Profile = z.infer<typeof profileSchema>;

export const defaultProfile: Profile = {
    ...defaultItem,
    network: "",
    username: "",
    icon: "",
    url: defaultUrl,
};

// Project
export const projectSchema = itemSchema.extend({
    name: z.string().min(1),
    description: z.string(),
    date: z.string(),
    summary: z.string(),
    keywords: z.array(z.string()).default([]),
    url: urlSchema,
});

export type Project = z.infer<typeof projectSchema>;

export const defaultProject: Project = {
    ...defaultItem,
    name: "",
    description: "",
    date: "",
    summary: "",
    keywords: [],
    url: defaultUrl,
};

// Publication
export const publicationSchema = itemSchema.extend({
    name: z.string().min(1),
    publisher: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Publication = z.infer<typeof publicationSchema>;

export const defaultPublication: Publication = {
    ...defaultItem,
    name: "",
    publisher: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// Reference
export const referenceSchema = itemSchema.extend({
    name: z.string().min(1),
    description: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Reference = z.infer<typeof referenceSchema>;

export const defaultReference: Reference = {
    ...defaultItem,
    name: "",
    description: "",
    summary: "",
    url: defaultUrl,
};

// Skill
export const skillSchema = itemSchema.extend({
    name: z.string(),
    description: z.string(),
    level: z.coerce.number().min(0).max(5).default(1),
    keywords: z.array(z.string()).default([]),
});

export type Skill = z.infer<typeof skillSchema>;

export const defaultSkill: Skill = {
    ...defaultItem,
    name: "",
    description: "",
    level: 1,
    keywords: [],
};

// Volunteer
export const volunteerSchema = itemSchema.extend({
    organization: z.string().min(1),
    position: z.string(),
    location: z.string(),
    date: z.string(),
    summary: z.string(),
    url: urlSchema,
});

export type Volunteer = z.infer<typeof volunteerSchema>;

export const defaultVolunteer: Volunteer = {
    ...defaultItem,
    organization: "",
    position: "",
    location: "",
    date: "",
    summary: "",
    url: defaultUrl,
};

// --- Aggregate Sections ---

export const sectionSchema = z.object({
    name: z.string(),
    columns: z.number().min(1).max(5).default(1),
    separateLinks: z.boolean().default(true),
    visible: z.boolean().default(true),
});

export const customSchema = sectionSchema.extend({
    id: idSchema,
    items: z.array(customSectionSchema),
});

export const sectionsSchema = z.object({
    summary: sectionSchema.extend({
        id: z.literal("summary"),
        content: z.string().default(""),
    }),
    awards: sectionSchema.extend({
        id: z.literal("awards"),
        items: z.array(awardSchema),
    }),
    certifications: sectionSchema.extend({
        id: z.literal("certifications"),
        items: z.array(certificationSchema),
    }),
    education: sectionSchema.extend({
        id: z.literal("education"),
        items: z.array(educationSchema),
    }),
    experience: sectionSchema.extend({
        id: z.literal("experience"),
        items: z.array(experienceSchema),
    }),
    volunteer: sectionSchema.extend({
        id: z.literal("volunteer"),
        items: z.array(volunteerSchema),
    }),
    interests: sectionSchema.extend({
        id: z.literal("interests"),
        items: z.array(interestSchema),
    }),
    languages: sectionSchema.extend({
        id: z.literal("languages"),
        items: z.array(languageSchema),
    }),
    profiles: sectionSchema.extend({
        id: z.literal("profiles"),
        items: z.array(profileSchema),
    }),
    projects: sectionSchema.extend({
        id: z.literal("projects"),
        items: z.array(projectSchema),
    }),
    publications: sectionSchema.extend({
        id: z.literal("publications"),
        items: z.array(publicationSchema),
    }),
    references: sectionSchema.extend({
        id: z.literal("references"),
        items: z.array(referenceSchema),
    }),
    skills: sectionSchema.extend({
        id: z.literal("skills"),
        items: z.array(skillSchema),
    }),
    custom: z.record(z.string(), customSchema),
});

export type Section = z.infer<typeof sectionSchema>;
export type Sections = z.infer<typeof sectionsSchema>;

export type SectionKey = "basics" | keyof Sections | `custom.${string}`;
export type SectionWithItem<T = unknown> = Sections[FilterKeys<Sections, { items: T[] }>];
export type SectionItem = SectionWithItem["items"][number];
export type CustomSectionGroup = z.infer<typeof customSchema>;

export const defaultSection: Section = {
    name: "",
    columns: 1,
    separateLinks: true,
    visible: true,
};

export const defaultSections: Sections = {
    summary: { ...defaultSection, id: "summary", name: "Summary", content: "" },
    awards: { ...defaultSection, id: "awards", name: "Awards", items: [] },
    certifications: { ...defaultSection, id: "certifications", name: "Certifications", items: [] },
    education: { ...defaultSection, id: "education", name: "Education", items: [] },
    experience: { ...defaultSection, id: "experience", name: "Experience", items: [] },
    volunteer: { ...defaultSection, id: "volunteer", name: "Volunteering", items: [] },
    interests: { ...defaultSection, id: "interests", name: "Interests", items: [] },
    languages: { ...defaultSection, id: "languages", name: "Languages", items: [] },
    profiles: { ...defaultSection, id: "profiles", name: "Profiles", items: [] },
    projects: { ...defaultSection, id: "projects", name: "Projects", items: [] },
    publications: { ...defaultSection, id: "publications", name: "Publications", items: [] },
    references: { ...defaultSection, id: "references", name: "References", items: [] },
    skills: { ...defaultSection, id: "skills", name: "Skills", items: [] },
    custom: {},
};

// --- Main Resume Data ---

export const resumeDataSchema = z.object({
    basics: basicsSchema,
    sections: sectionsSchema,
    metadata: metadataSchema,
});

export type ResumeData = z.infer<typeof resumeDataSchema>;

export const defaultResumeData: ResumeData = {
    basics: defaultBasics,
    sections: defaultSections,
    metadata: defaultMetadata,
};

// --- Sample Data ---

export const sampleResume: ResumeData = {
    basics: {
        name: "John Doe",
        headline: "Creative and Innovative Web Developer",
        email: "john.doe@gmail.com",
        phone: "(555) 123-4567",
        location: "Pleasantville, CA 94588",
        url: {
            label: "",
            href: "https://johndoe.me/",
        },
        customFields: [],
        picture: {
            url: "https://i.imgur.com/HgwyOuJ.jpg",
            size: 120,
            aspectRatio: 1,
            borderRadius: 0,
            effects: {
                hidden: false,
                border: false,
                grayscale: false,
            },
        },
    },
    sections: {
        summary: {
            name: "Summary",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "summary",
            content:
                "<p>Innovative Web Developer with 5 years of experience in building impactful and user-friendly websites and applications. Specializes in <strong>front-end technologies</strong> and passionate about modern web standards and cutting-edge development techniques. Proven track record of leading successful projects from concept to deployment.</p>",
        },
        awards: {
            name: "Awards",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "awards",
            items: [],
        },
        certifications: {
            name: "Certifications",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "certifications",
            items: [
                {
                    id: "spdhh9rrqi1gvj0yqnbqunlo",
                    visible: true,
                    name: "Full-Stack Web Development",
                    issuer: "CodeAcademy",
                    date: "2020",
                    summary: "",
                    url: {
                        label: "",
                        href: "",
                    },
                },
                {
                    id: "n838rddyqv47zexn6cxauwqp",
                    visible: true,
                    name: "AWS Certified Developer",
                    issuer: "Amazon Web Services",
                    date: "2019",
                    summary: "",
                    url: {
                        label: "",
                        href: "",
                    },
                },
            ],
        },
        education: {
            name: "Education",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "education",
            items: [
                {
                    id: "yo3p200zo45c6cdqc6a2vtt3",
                    visible: true,
                    institution: "University of California",
                    studyType: "Bachelor's in Computer Science",
                    area: "Berkeley, CA",
                    score: "",
                    date: "August 2012 to May 2016",
                    summary: "",
                    url: {
                        label: "",
                        href: "",
                    },
                },
            ],
        },
        experience: {
            name: "Experience",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "experience",
            items: [
                {
                    id: "lhw25d7gf32wgdfpsktf6e0x",
                    visible: true,
                    company: "Creative Solutions Inc.",
                    position: "Senior Web Developer",
                    location: "San Francisco, CA",
                    date: "January 2019 to Present",
                    summary:
                        "<ul><li><p>Spearheaded the redesign of the main product website, resulting in a 40% increase in user engagement.</p></li><li><p>Developed and implemented a new responsive framework, improving cross-device compatibility.</p></li><li><p>Mentored a team of four junior developers, fostering a culture of technical excellence.</p></li></ul>",
                    url: {
                        label: "",
                        href: "https://creativesolutions.inc/",
                    },
                },
                {
                    id: "r6543lil53ntrxmvel53gbtm",
                    visible: true,
                    company: "TechAdvancers",
                    position: "Web Developer",
                    location: "San Jose, CA",
                    date: "June 2016 to December 2018",
                    summary:
                        "<ul><li><p>Collaborated in a team of 10 to develop high-quality web applications using React.js and Node.js.</p></li><li><p>Managed the integration of third-party services such as Stripe for payments and Twilio for SMS services.</p></li><li><p>Optimized application performance, achieving a 30% reduction in load times.</p></li></ul>",
                    url: {
                        label: "",
                        href: "https://techadvancers.com/",
                    },
                },
            ],
        },
        volunteer: {
            name: "Volunteering",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "volunteer",
            items: [],
        },
        interests: {
            name: "Interests",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "interests",
            items: [],
        },
        languages: {
            name: "Languages",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "languages",
            items: [],
        },
        profiles: {
            name: "Profiles",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "profiles",
            items: [
                {
                    id: "cnbk5f0aeqvhx69ebk7hktwd",
                    visible: true,
                    network: "LinkedIn",
                    username: "johndoe",
                    icon: "linkedin",
                    url: {
                        label: "",
                        href: "https://linkedin.com/in/johndoe",
                    },
                },
                {
                    id: "ukl0uecvzkgm27mlye0wazlb",
                    visible: true,
                    network: "GitHub",
                    username: "johndoe",
                    icon: "github",
                    url: {
                        label: "",
                        href: "https://github.com/johndoe",
                    },
                },
            ],
        },
        projects: {
            name: "Projects",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "projects",
            items: [
                {
                    id: "yw843emozcth8s1ubi1ubvlf",
                    visible: true,
                    name: "E-Commerce Platform",
                    description: "Project Lead",
                    date: "",
                    summary:
                        "<p>Led the development of a full-stack e-commerce platform, improving sales conversion by 25%.</p>",
                    keywords: [],
                    url: {
                        label: "",
                        href: "",
                    },
                },
                {
                    id: "ncxgdjjky54gh59iz2t1xi1v",
                    visible: true,
                    name: "Interactive Dashboard",
                    description: "Frontend Developer",
                    date: "",
                    summary:
                        "<p>Created an interactive analytics dashboard for a SaaS application, enhancing data visualization for clients.</p>",
                    keywords: [],
                    url: {
                        label: "",
                        href: "",
                    },
                },
            ],
        },
        publications: {
            name: "Publications",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "publications",
            items: [],
        },
        references: {
            name: "References",
            columns: 1,
            separateLinks: true,
            visible: false,
            id: "references",
            items: [
                {
                    id: "f2sv5z0cce6ztjl87yuk8fak",
                    visible: true,
                    name: "Available upon request",
                    description: "",
                    summary: "",
                    url: {
                        label: "",
                        href: "",
                    },
                },
            ],
        },
        skills: {
            name: "Skills",
            columns: 1,
            separateLinks: true,
            visible: true,
            id: "skills",
            items: [
                {
                    id: "hn0keriukh6c0ojktl9gsgjm",
                    visible: true,
                    name: "Web Technologies",
                    description: "Advanced",
                    level: 0,
                    keywords: ["HTML5", "JavaScript", "PHP", "Python"],
                },
                {
                    id: "r8c3y47vykausqrgmzwg5pur",
                    visible: true,
                    name: "Web Frameworks",
                    description: "Intermediate",
                    level: 0,
                    keywords: ["React.js", "Angular", "Vue.js", "Laravel", "Django"],
                },
                {
                    id: "b5l75aseexqv17quvqgh73fe",
                    visible: true,
                    name: "Tools",
                    description: "Intermediate",
                    level: 0,
                    keywords: ["Webpack", "Git", "Jenkins", "Docker", "JIRA"],
                },
            ],
        },
        custom: {},
    },
    metadata: {
        template: "glalie",
        layout: [
            [
                ["summary", "experience", "education", "projects", "references"],
                [
                    "profiles",
                    "skills",
                    "certifications",
                    "interests",
                    "languages",
                    "awards",
                    "volunteer",
                    "publications",
                ],
            ],
        ],
        css: {
            value: "* {\n\toutline: 1px solid #000;\n\toutline-offset: 4px;\n}",
            visible: false,
        },
        page: {
            margin: 14,
            format: "a4",
            options: {
                breakLine: true,
                pageNumbers: true,
            },
        },
        theme: {
            background: "#ffffff",
            text: "#000000",
            primary: "#ca8a04",
        },
        typography: {
            font: {
                family: "Merriweather",
                subset: "latin",
                variants: ["regular"],
                size: 13,
            },
            lineHeight: 1.75,
            hideIcons: false,
            underlineLinks: true,
        },
        notes: "",
    },
};
