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

export interface NormalizedWorkdayJobDetails {
  source: "workday";
  externalId: string;
  title: string;
  company?: string;
  locationText?: string;
  additionalLocations?: string[];
  postedOn?: string;
  timeType?: string;
  jobDescriptionHtml: string;
  jobDescriptionText: string;
  jobUrl: string;
  cxsJobUrl: string;
  externalPath: string;
  raw: unknown;
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

export interface WorkdayFetchJobDetailsResponse {
  jobUrl: string;
  response: {
    job: NormalizedWorkdayJobDetails;
  };
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

export async function fetchWorkdayCxsJobDetails(
  jobUrl: string,
): Promise<WorkdayFetchJobDetailsResponse> {
  return fetchApi<WorkdayFetchJobDetailsResponse>(
    "/workday/fetch-job-details",
    {
      method: "POST",
      body: JSON.stringify({ jobUrl }),
    },
  );
}
