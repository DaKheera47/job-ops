import { fetchApi } from "./core";

export interface WorkdayFetchJobsResponse {
  careersUrl: string;
  cxsJobsUrl: string;
  response: unknown;
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
