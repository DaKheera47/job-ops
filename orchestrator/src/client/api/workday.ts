import { fetchApi } from "./core";

export interface WorkdayJobPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  [key: string]: unknown;
}

export interface NormalizedWorkdayJob {
  source: "workday";
  externalId: string;
  title: string;
  company?: string;
  locationText?: string;
  postedOn?: string;
  jobUrl: string;
  externalPath: string;
  raw: WorkdayJobPosting;
}

export interface WorkdayCxsJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedWorkdayJob[];
}

export interface WorkdayFetchJobsResponse {
  careersUrl: string;
  cxsJobsUrl: string;
  response: WorkdayCxsJobsResult;
}

export async function fetchWorkdayCxsJobs(
  careersUrl: string,
  maxJobs = 40,
): Promise<WorkdayFetchJobsResponse> {
  return fetchApi<WorkdayFetchJobsResponse>("/workday/fetch-jobs", {
    method: "POST",
    body: JSON.stringify({ careersUrl, maxJobs }),
  });
}
