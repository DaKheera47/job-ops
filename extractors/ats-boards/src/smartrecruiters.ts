import type { CreateJobInput } from "@shared/types/jobs";
import { detectIsRemoteFromAts } from "./types";

interface SmartRecruitersPosting {
  id?: string;
  name?: string;
  applyUrl?: string;
  releasedDate?: string;
  shortLocation?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
  company?: {
    name?: string;
  };
  department?: {
    label?: string;
  };
  typeOfEmployment?: {
    label?: string;
  };
}

interface SmartRecruitersResponse {
  content?: SmartRecruitersPosting[];
  totalFound?: number;
  limit?: number;
  offset?: number;
}

const API_BASE = "https://api.smartrecruiters.com/v1/companies";
const PAGE_LIMIT = 100;
const MAX_OFFSET = 1000;

function buildLocation(posting: SmartRecruitersPosting): string {
  if (posting.shortLocation?.trim()) return posting.shortLocation.trim();
  const loc = posting.location;
  if (!loc) return "Not specified";
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Not specified";
}

export async function fetchSmartRecruitersJobs(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateJobInput[]> {
  const allJobs: CreateJobInput[] = [];
  let offset = 0;

  while (offset <= MAX_OFFSET) {
    const url = `${API_BASE}/${encodeURIComponent(slug)}/postings?limit=${PAGE_LIMIT}&offset=${offset}`;
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `SmartRecruiters API for "${slug}" returned ${response.status}`,
      );
    }

    const data = (await response.json()) as SmartRecruitersResponse;
    const postings = data.content;
    if (!Array.isArray(postings) || postings.length === 0) break;

    for (const p of postings) {
      if (!p.name || !p.applyUrl) continue;

      const location = buildLocation(p);
      const isRemote = detectIsRemoteFromAts(location);
      allJobs.push({
        source: "smartrecruiters",
        sourceJobId: p.id ?? undefined,
        title: p.name ?? "Unknown Title",
        employer: p.company?.name ?? slug,
        jobUrl: p.applyUrl ?? "",
        applicationLink: p.applyUrl ?? undefined,
        location,
        locationEvidence: { location, source: "smartrecruiters" },
        datePosted: p.releasedDate ?? undefined,
        jobFunction: p.department?.label ?? undefined,
        jobType: p.typeOfEmployment?.label ?? undefined,
        isRemote,
      });
    }

    if (postings.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return allJobs;
}
