import { z } from "zod";

export {
  COUNTRY_BOUND_DEFAULT_SOURCES,
  REMOTE_FRIENDLY_SOURCES,
  autoEnabledRemoteSources,
  resolveAutoEnabledSources,
} from "./source-groups";

export const EXTRACTOR_SOURCE_IDS = [
  "gradcracker",
  "indeed",
  "linkedin",
  "glassdoor",
  "ukvisajobs",
  "adzuna",
  "hiringcafe",
  "startupjobs",
  "workingnomads",
  "golangjobs",
  "seek",
  "weworkremotely",
  "remotive",
  "remoteok",
  "himalayas",
  "justjoinit",
  "nofluffjobs",
  "hhru",
  "greenhouse",
  "ashby",
  "lever",
  "workday",
  "smartrecruiters",
  "manual",
] as const;

export type ExtractorSourceId = (typeof EXTRACTOR_SOURCE_IDS)[number];

export interface ExtractorSourceMetadata {
  label: string;
  order: number;
  category: "pipeline" | "manual";
  requiresCredentials?: boolean;
  ukOnly?: boolean;
}

export const EXTRACTOR_SOURCE_METADATA: Record<
  ExtractorSourceId,
  ExtractorSourceMetadata
> = {
  gradcracker: {
    label: "Gradcracker",
    order: 10,
    category: "pipeline",
    ukOnly: true,
  },
  indeed: { label: "Indeed", order: 20, category: "pipeline" },
  linkedin: { label: "LinkedIn", order: 30, category: "pipeline" },
  glassdoor: { label: "Glassdoor", order: 40, category: "pipeline" },
  ukvisajobs: {
    label: "UK Visa Jobs",
    order: 50,
    category: "pipeline",
    requiresCredentials: true,
    ukOnly: true,
  },
  adzuna: {
    label: "Adzuna",
    order: 60,
    category: "pipeline",
    requiresCredentials: true,
  },
  hiringcafe: { label: "Hiring Cafe", order: 70, category: "pipeline" },
  startupjobs: { label: "startup.jobs", order: 80, category: "pipeline" },
  workingnomads: {
    label: "Working Nomads",
    order: 90,
    category: "pipeline",
  },
  golangjobs: {
    label: "Golang Jobs",
    order: 100,
    category: "pipeline",
  },
  seek: {
    label: "Seek",
    order: 105,
    category: "pipeline",
    requiresCredentials: true,
  },
  weworkremotely: { label: "We Work Remotely", order: 106, category: "pipeline" },
  remotive: { label: "Remotive", order: 107, category: "pipeline" },
  remoteok: { label: "Remote OK", order: 108, category: "pipeline" },
  himalayas: { label: "Himalayas", order: 109, category: "pipeline" },
  justjoinit: { label: "JustJoin.it", order: 110, category: "pipeline" },
  nofluffjobs: { label: "NoFluffJobs", order: 110, category: "pipeline" },
  hhru: { label: "HeadHunter (hh.ru)", order: 110, category: "pipeline" },
  greenhouse: { label: "Greenhouse", order: 111, category: "pipeline" },
  ashby: { label: "Ashby", order: 112, category: "pipeline" },
  lever: { label: "Lever", order: 113, category: "pipeline" },
  workday: { label: "Workday", order: 114, category: "pipeline" },
  smartrecruiters: { label: "SmartRecruiters", order: 115, category: "pipeline" },
  manual: { label: "Manual", order: 120, category: "manual" },
};

export const PIPELINE_EXTRACTOR_SOURCE_IDS = EXTRACTOR_SOURCE_IDS.filter(
  (source) => EXTRACTOR_SOURCE_METADATA[source].category === "pipeline",
);

const extractorSourceTuple = EXTRACTOR_SOURCE_IDS as unknown as [
  ExtractorSourceId,
  ...ExtractorSourceId[],
];

export const extractorSourceEnum = z.enum(extractorSourceTuple);

export function isExtractorSourceId(value: string): value is ExtractorSourceId {
  return EXTRACTOR_SOURCE_IDS.includes(value as ExtractorSourceId);
}

export function sourceLabel(source: ExtractorSourceId): string {
  return EXTRACTOR_SOURCE_METADATA[source].label;
}

export function sortSources<T extends { source: ExtractorSourceId }>(
  values: T[],
): T[] {
  return [...values].sort(
    (left, right) =>
      EXTRACTOR_SOURCE_METADATA[left.source].order -
      EXTRACTOR_SOURCE_METADATA[right.source].order,
  );
}
