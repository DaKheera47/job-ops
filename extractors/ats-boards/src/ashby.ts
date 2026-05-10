import type { CreateJobInput } from "@shared/types/jobs";

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  location?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  departmentName?: string;
  id?: string;
  employmentType?: string;
  compensation?: {
    compensationTierSummary?: string;
  };
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

export async function fetchAshbyJobs(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateJobInput[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Ashby API for "${slug}" returned ${response.status}`);
  }

  const data = (await response.json()) as AshbyResponse;
  if (!data.jobs || !Array.isArray(data.jobs)) return [];

  return data.jobs
    .filter((j) => j.title && j.jobUrl)
    .map((j): CreateJobInput => ({
      source: "ashby",
      sourceJobId: j.id ?? undefined,
      title: j.title ?? "Unknown Title",
      employer: slug,
      jobUrl: j.jobUrl ?? "",
      applicationLink: j.jobUrl ?? undefined,
      location: j.location ?? "Not specified",
      jobDescription: j.descriptionHtml ?? undefined,
      datePosted: j.publishedAt ?? undefined,
      jobFunction: j.departmentName ?? undefined,
      jobType: j.employmentType ?? undefined,
      salary: j.compensation?.compensationTierSummary ?? undefined,
    }));
}
