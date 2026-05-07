import { DEMO_PROJECT_CATALOG } from "@server/config/demo-defaults";
import * as jobsRepo from "@server/repositories/jobs";
import { replaceCurrentDesignResumeDocument } from "@server/services/design-resume";
import { generatePdf, type TailoredPdfContent } from "@server/services/pdf";
import {
  createJobPdfFingerprint,
  type PdfFingerprintContext,
  resolvePdfFingerprintContext,
} from "@server/services/pdf-fingerprint";
import { clearProfileCache } from "@server/services/profile";
import { buildDefaultReactiveResumeDocument } from "@server/services/rxresume/document";
import type { DesignResumeJson, Job, JobStatus } from "@shared/types";

function buildDemoDesignResume(): DesignResumeJson {
  const document = structuredClone(
    buildDefaultReactiveResumeDocument(),
  ) as DesignResumeJson;

  document.basics = {
    ...document.basics,
    name: "Avery Stone",
    headline: "Senior Backend Engineer",
    email: "avery@demo.jobops.local",
    phone: "+1 (555) 010-2026",
    location: "New York, NY",
    website: {
      url: "https://demo.jobops.local",
      label: "jobops demo",
    },
    customFields: [],
  };

  document.summary = {
    ...document.summary,
    content:
      "Backend and platform engineer focused on reliable TypeScript services, workflow automation, and observability-first systems design.",
  };

  document.sections = {
    ...document.sections,
    experience: {
      ...document.sections.experience,
      items: [
        {
          id: "demo-exp-1",
          hidden: false,
          company: "Northstar Systems",
          position: "Senior Backend Engineer",
          location: "Remote",
          period: "2023 - Present",
          website: { url: "https://demo.jobops.local", label: "company" },
          description:
            "Led tenant-safe workflow services, queue processing, and request tracing improvements across internal operations tooling.",
          roles: [],
        },
        {
          id: "demo-exp-2",
          hidden: false,
          company: "Beacon Labs",
          position: "Software Engineer",
          location: "Chicago, IL",
          period: "2020 - 2023",
          website: { url: "https://demo.jobops.local", label: "company" },
          description:
            "Built API integrations, operational dashboards, and incident-reduction tooling for customer support workflows.",
          roles: [],
        },
      ],
    },
    education: {
      ...document.sections.education,
      items: [
        {
          id: "demo-edu-1",
          hidden: false,
          school: "University of Illinois",
          degree: "B.S.",
          area: "Computer Science",
          grade: "",
          location: "Urbana-Champaign, IL",
          period: "2016 - 2020",
          website: { url: "", label: "" },
          description: "",
        },
      ],
    },
    projects: {
      ...document.sections.projects,
      items: DEMO_PROJECT_CATALOG.map((project) => ({
        id: project.id,
        hidden: !project.isVisibleInBase,
        name: project.name,
        period: project.date,
        website: { url: "", label: "" },
        description: project.description,
        options: { showLinkInTitle: false },
      })),
    },
    skills: {
      ...document.sections.skills,
      items: [
        {
          id: "demo-skill-1",
          hidden: false,
          icon: "",
          name: "Backend",
          proficiency: "",
          level: 4,
          keywords: ["TypeScript", "Node.js", "APIs", "SQL"],
        },
        {
          id: "demo-skill-2",
          hidden: false,
          icon: "",
          name: "Systems",
          proficiency: "",
          level: 4,
          keywords: ["Reliability", "Queues", "Observability", "Automation"],
        },
      ],
    },
  };

  return document;
}

function parseTailoredSkills(
  raw: string | null,
): Array<{ name: string; keywords: string[] }> {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    if (
      parsed.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { name?: unknown }).name === "string" &&
          Array.isArray((item as { keywords?: unknown }).keywords),
      )
    ) {
      return parsed as Array<{ name: string; keywords: string[] }>;
    }

    const keywords = parsed.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
    return keywords.length > 0 ? [{ name: "Core Skills", keywords }] : [];
  } catch {
    return [];
  }
}

function buildTailoredPdfContent(job: Job): TailoredPdfContent {
  return {
    summary: job.tailoredSummary ?? "",
    headline: job.tailoredHeadline ?? "",
    skills: parseTailoredSkills(job.tailoredSkills),
  };
}

function resolveDemoPdfStatus(status: JobStatus): JobStatus {
  if (status === "discovered" || status === "processing") return "ready";
  return status;
}

export async function seedDemoDesignResume(): Promise<void> {
  await replaceCurrentDesignResumeDocument({
    importedAt: new Date().toISOString(),
    resumeJson: buildDemoDesignResume(),
    sourceResumeId: null,
    sourceMode: null,
  });
  clearProfileCache();
}

export async function persistDemoGeneratedPdf(
  job: Job,
  fingerprintContext?: PdfFingerprintContext,
  options?: { seedResume?: boolean },
): Promise<Job> {
  if (options?.seedResume ?? true) {
    await seedDemoDesignResume();
  }

  const result = await generatePdf(
    job.id,
    buildTailoredPdfContent(job),
    job.jobDescription ?? "",
    undefined,
    job.selectedProjectIds,
    {
      tracerLinksEnabled: job.tracerLinksEnabled,
      tracerCompanyName: job.employer ?? null,
      requestOrigin: null,
    },
  );

  if (!result.success || !result.pdfPath) {
    throw new Error(result.error ?? "Failed to generate demo PDF");
  }

  const context = fingerprintContext ?? (await resolvePdfFingerprintContext());
  const pdfGeneratedAt = new Date().toISOString();
  const pdfFingerprint = createJobPdfFingerprint(job, context);
  const nextStatus = resolveDemoPdfStatus(job.status);
  const updated = await jobsRepo.updateJob(job.id, {
    ...(job.status === "ready" || nextStatus !== job.status
      ? { status: nextStatus }
      : {}),
    pdfPath: result.pdfPath,
    pdfSource: "generated",
    pdfRegenerating: false,
    pdfFingerprint,
    pdfGeneratedAt,
  });

  if (!updated) {
    throw new Error("Job not found");
  }

  return updated;
}
