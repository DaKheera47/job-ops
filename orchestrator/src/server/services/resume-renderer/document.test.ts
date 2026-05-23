import { describe, expect, it } from "vitest";
import { normalizeResumeJsonToLatexDocument } from "./document";

describe("normalizeResumeJsonToLatexDocument", () => {
  it("keeps every editable Resume Studio section in the renderer model", () => {
    const document = normalizeResumeJsonToLatexDocument({
      picture: {
        hidden: false,
        url: "/api/design-resume/assets/asset-1/content",
        size: 96,
        rotation: 0,
        aspectRatio: 1.2,
        borderRadius: 12,
        borderColor: "#000000",
        borderWidth: 1,
        shadowColor: "#111111",
        shadowWidth: 2,
      },
      basics: {
        name: "Jane Doe",
        headline: "Senior Software Engineer",
        email: "jane@example.com",
        phone: "+44 1234 567890",
        location: "London, UK",
        website: {
          label: "Portfolio",
          url: "https://jane.dev",
        },
        customFieldsTitle: "Highlights",
        customFields: [
          {
            id: "custom-1",
            title: "Eligibility",
            icon: "",
            text: "Eligible to work in the UK",
            link: "",
          },
        ],
      },
      summary: {
        title: "About",
        hidden: false,
        content: "<p>Builds resilient platform systems.</p>",
      },
      sections: {
        profiles: {
          title: "Links",
          hidden: false,
          items: [
            {
              id: "profile-1",
              hidden: false,
              network: "LinkedIn",
              username: "janedoe",
              website: { url: "https://linkedin.com/in/janedoe" },
            },
          ],
        },
        experience: {
          title: "Experience",
          hidden: false,
          items: [
            {
              id: "exp-1",
              hidden: false,
              company: "Acme",
              position: "Platform Engineer",
              location: "Remote",
              period: "2023 -- Present",
              website: { url: "https://acme.example.com" },
              description: "<ul><li>Improved API reliability</li></ul>",
            },
          ],
        },
        education: {
          title: "Education",
          hidden: false,
          items: [
            {
              id: "edu-1",
              hidden: false,
              school: "University",
              degree: "MSc",
              area: "Computer Science",
              grade: "Distinction",
              location: "London",
              period: "2020",
              website: { url: "https://uni.example.com" },
              description: "Distributed systems",
            },
          ],
        },
        projects: {
          title: "Projects",
          hidden: false,
          items: [
            {
              id: "proj-1",
              hidden: false,
              name: "JobOps",
              period: "2024",
              website: { url: "https://jobops.dev" },
              description: "<ul><li>Built matching workflows</li></ul>",
              keywords: ["TypeScript", "SQLite"],
            },
          ],
        },
        skills: {
          title: "Skills",
          hidden: false,
          items: [
            {
              id: "skill-1",
              hidden: false,
              name: "Backend",
              keywords: ["TypeScript", "Node.js"],
            },
          ],
        },
        languages: {
          title: "Languages",
          hidden: false,
          items: [
            {
              id: "lang-1",
              hidden: false,
              language: "English",
              fluency: "Native",
              level: 5,
            },
          ],
        },
        interests: {
          title: "Interests",
          hidden: false,
          items: [
            {
              id: "interest-1",
              hidden: false,
              name: "Climbing",
              keywords: ["Bouldering"],
            },
          ],
        },
        awards: {
          title: "Awards",
          hidden: false,
          items: [
            {
              id: "award-1",
              hidden: false,
              title: "Engineer of the Year",
              awarder: "Acme",
              date: "2024",
              description: "Platform leadership",
            },
          ],
        },
        certifications: {
          title: "Certifications",
          hidden: false,
          items: [
            {
              id: "cert-1",
              hidden: false,
              title: "AWS Solutions Architect",
              issuer: "Amazon",
              date: "2023",
              description: "Professional level",
            },
          ],
        },
        publications: {
          title: "Publications",
          hidden: false,
          items: [
            {
              id: "pub-1",
              hidden: false,
              title: "Scaling JobOps",
              publisher: "InfoQ",
              date: "2022",
              description: "Architecture write-up",
            },
          ],
        },
        volunteer: {
          title: "Volunteer",
          hidden: false,
          items: [
            {
              id: "vol-1",
              hidden: false,
              organization: "Code Club",
              location: "London",
              period: "2021 -- Present",
              description: "Mentor students weekly",
            },
          ],
        },
        references: {
          title: "References",
          hidden: false,
          items: [
            {
              id: "ref-1",
              hidden: false,
              name: "Alex Manager",
              position: "Director",
              phone: "+44 0000 000000",
              description: "Reference available on request",
            },
          ],
        },
      },
    });

    expect(document.picture?.assetId).toBe("asset-1");
    expect(document.location).toBe("London, UK");
    expect(document.profileItems).toHaveLength(1);
    expect(document.customFieldItems).toHaveLength(1);
    expect(document.customFieldItems[0]).toEqual({
      title: "Eligibility",
      text: "Eligible to work in the UK",
      url: null,
    });
    expect(document.sectionTitles?.customFields).toBe("Highlights");
    expect(document.summary).toBe("Builds resilient platform systems.");
    expect(document.experience).toHaveLength(1);
    expect(document.education).toHaveLength(1);
    expect(document.projects).toHaveLength(1);
    expect(document.skillGroups).toHaveLength(1);
    expect(document.languages).toHaveLength(1);
    expect(document.interests).toHaveLength(1);
    expect(document.awards).toHaveLength(1);
    expect(document.certifications).toHaveLength(1);
    expect(document.publications).toHaveLength(1);
    expect(document.volunteer).toHaveLength(1);
    expect(document.references).toHaveLength(1);
    expect(document.sectionTitles?.profiles).toBe("Links");
    expect(document.sectionTitles?.summary).toBe("About");
  });

  it("respects hidden sections and items", () => {
    const document = normalizeResumeJsonToLatexDocument({
      basics: { name: "Jane Doe" },
      summary: { hidden: true, content: "Hidden summary" },
      sections: {
        profiles: {
          hidden: true,
          items: [{ id: "profile-1", hidden: false, network: "LinkedIn" }],
        },
        awards: {
          hidden: false,
          items: [
            { id: "award-1", hidden: true, title: "Hidden award" },
            { id: "award-2", hidden: false, title: "Visible award" },
          ],
        },
      },
    });

    expect(document.summary).toBeNull();
    expect(document.profileItems).toHaveLength(0);
    expect(document.awards).toHaveLength(1);
    expect(document.awards[0]?.title).toBe("Visible award");
  });

  it("preserves basic formatting tags and strips other HTML tags", () => {
    const document = normalizeResumeJsonToLatexDocument({
      basics: { name: "Jane Doe" },
      summary: {
        hidden: false,
        content:
          '<p><strong>Bold statement</strong> and <em>italic explanation</em>. Also <span class="ignore">ignored tag</span>.</p>',
      },
      sections: {
        experience: {
          hidden: false,
          items: [
            {
              id: "exp-1",
              company: "Acme",
              description:
                '<ul><li>Worked with <b>bold text</b> and <i>italic text</i>. <div style="color: red;">Strip this div</div></li></ul>',
            },
          ],
        },
      },
    });

    expect(document.summary).toBe(
      "<strong>Bold statement</strong> and <em>italic explanation</em>. Also ignored tag .",
    );
    expect(document.experience[0]?.bullets).toEqual([
      "Worked with <b>bold text</b> and <i>italic text</i>. Strip this div",
    ]);
  });
});
