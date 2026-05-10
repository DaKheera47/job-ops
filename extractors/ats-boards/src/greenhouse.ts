import type { CreateJobInput } from "@shared/types/jobs";

interface GreenhouseJob {
  id?: number;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
  departments?: Array<{ name?: string }>;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export async function fetchGreenhouseJobs(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateJobInput[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Greenhouse API for "${slug}" returned ${response.status}`,
    );
  }

  const data = (await response.json()) as GreenhouseResponse;
  if (!data.jobs || !Array.isArray(data.jobs)) return [];

  return data.jobs
    .filter((j) => j.title && j.absolute_url)
    .map((j): CreateJobInput => ({
      source: "greenhouse",
      sourceJobId: j.id != null ? String(j.id) : undefined,
      title: j.title ?? "Unknown Title",
      employer: slug,
      jobUrl: j.absolute_url ?? "",
      applicationLink: j.absolute_url ?? undefined,
      location: j.location?.name ?? "Not specified",
      jobDescription: j.content ?? undefined,
      datePosted: j.updated_at ?? undefined,
      jobFunction: j.departments?.map((d) => d.name).filter(Boolean).join(", ") ?? undefined,
    }));
}
