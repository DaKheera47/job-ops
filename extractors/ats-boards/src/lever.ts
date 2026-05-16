import type { CreateJobInput } from "@shared/types/jobs";
import { detectIsRemoteFromAts } from "./types";

interface LeverJob {
  id?: string;
  text?: string;
  hostedUrl?: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
  };
  descriptionPlain?: string;
  description?: string;
  createdAt?: number;
  additionalPlain?: string;
}

export async function fetchLeverJobs(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateJobInput[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Lever API for "${slug}" returned ${response.status}`);
  }

  const data = (await response.json()) as LeverJob[];
  if (!Array.isArray(data)) return [];

  return data
    .filter((j) => j.text && j.hostedUrl)
    .map((j): CreateJobInput => {
      const descriptionParts = [j.descriptionPlain, j.additionalPlain]
        .filter(Boolean)
        .join("\n\n");

      const location = j.categories?.location ?? "Not specified";
      const description = descriptionParts || j.description || undefined;
      const isRemote = detectIsRemoteFromAts(location, description);
      return {
        source: "lever",
        sourceJobId: j.id ?? undefined,
        title: j.text ?? "Unknown Title",
        employer: slug,
        jobUrl: j.hostedUrl ?? "",
        applicationLink: j.hostedUrl ? `${j.hostedUrl}/apply` : undefined,
        location,
        locationEvidence: { location, source: "lever" },
        jobDescription: description,
        jobFunction: j.categories?.department ?? j.categories?.team ?? undefined,
        jobType: j.categories?.commitment ?? undefined,
        datePosted: j.createdAt
          ? new Date(j.createdAt).toISOString()
          : undefined,
        isRemote,
      };
    });
}
