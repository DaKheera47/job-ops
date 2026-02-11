import type { Job, PostApplicationMessage } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/jobs", () => ({
  getAllJobs: vi.fn(),
}));

vi.mock("@server/repositories/post-application-message-candidates", () => ({
  replacePostApplicationMessageCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@server/repositories/post-application-messages", () => ({
  updatePostApplicationMessageSuggestion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/services/llm-service", () => ({
  LlmService: class {
    callJson = vi.fn().mockResolvedValue({
      success: true,
      data: { jobId: "job-2", score: 84, reason: "best" },
    });
  },
}));

import { __private__, runJobMappingForMessage } from "./engine";

const baseMessage: PostApplicationMessage = {
  id: "msg-1",
  provider: "gmail",
  accountKey: "default",
  integrationId: "int-1",
  syncRunId: "run-1",
  externalMessageId: "ext-1",
  externalThreadId: "thr-1",
  fromAddress: "noreply@careers.roku.com",
  fromDomain: "careers.roku.com",
  senderName: "Roku Careers",
  subject: "Thanks for applying to Roku",
  receivedAt: Date.parse("2026-02-10T12:00:00.000Z"),
  snippet: "Your application was received for Front End JavaScript Developer",
  classificationLabel: "Application confirmation",
  classificationConfidence: 0.95,
  classificationPayload: {
    companyName: "Roku Interactive",
    jobTitle: "Front End JavaScript Developer",
  },
  relevanceKeywordScore: 99,
  relevanceLlmScore: null,
  relevanceFinalScore: 99,
  relevanceDecision: "relevant",
  reviewStatus: "pending_review",
  matchedJobId: null,
  decidedAt: null,
  decidedBy: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-02-10T12:00:00.000Z",
  updatedAt: "2026-02-10T12:00:00.000Z",
};

const jobs: Job[] = [
  {
    id: "job-1",
    source: "manual",
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: null,
    title: "Frontend Engineer",
    employer: "Not Roku",
    employerUrl: null,
    jobUrl: "https://example.com/job-1",
    applicationLink: null,
    disciplines: null,
    deadline: null,
    salary: null,
    location: null,
    degreeRequired: null,
    starting: null,
    jobDescription: null,
    status: "applied",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    suitabilityReason: null,
    tailoredSummary: null,
    tailoredHeadline: null,
    tailoredSkills: null,
    selectedProjectIds: null,
    pdfPath: null,
    sponsorMatchScore: null,
    sponsorMatchNames: null,
    jobType: null,
    salarySource: null,
    salaryInterval: null,
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    isRemote: null,
    jobLevel: null,
    jobFunction: null,
    listingType: null,
    emails: null,
    companyIndustry: null,
    companyLogo: null,
    companyUrlDirect: null,
    companyAddresses: null,
    companyNumEmployees: null,
    companyRevenue: null,
    companyDescription: null,
    skills: null,
    experienceRange: null,
    companyRating: null,
    companyReviewsCount: null,
    vacancyCount: null,
    workFromHomeType: null,
    discoveredAt: "2026-02-01T00:00:00.000Z",
    processedAt: null,
    appliedAt: "2026-01-20T00:00:00.000Z",
    createdAt: "2026-01-20T00:00:00.000Z",
    updatedAt: "2026-01-20T00:00:00.000Z",
  },
  {
    id: "job-2",
    source: "manual",
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: null,
    title: "Front End JavaScript Developer",
    employer: "Roku Interactive",
    employerUrl: "https://www.roku.com/careers",
    jobUrl: "https://example.com/job-2",
    applicationLink: null,
    disciplines: null,
    deadline: null,
    salary: null,
    location: null,
    degreeRequired: null,
    starting: null,
    jobDescription: null,
    status: "applied",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    suitabilityReason: null,
    tailoredSummary: null,
    tailoredHeadline: null,
    tailoredSkills: null,
    selectedProjectIds: null,
    pdfPath: null,
    sponsorMatchScore: null,
    sponsorMatchNames: null,
    jobType: null,
    salarySource: null,
    salaryInterval: null,
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    isRemote: null,
    jobLevel: null,
    jobFunction: null,
    listingType: null,
    emails: null,
    companyIndustry: null,
    companyLogo: null,
    companyUrlDirect: "https://www.roku.com",
    companyAddresses: null,
    companyNumEmployees: null,
    companyRevenue: null,
    companyDescription: null,
    skills: null,
    experienceRange: null,
    companyRating: null,
    companyReviewsCount: null,
    vacancyCount: null,
    workFromHomeType: null,
    discoveredAt: "2026-02-01T00:00:00.000Z",
    processedAt: null,
    appliedAt: "2026-02-09T12:00:00.000Z",
    createdAt: "2026-02-09T12:00:00.000Z",
    updatedAt: "2026-02-09T12:00:00.000Z",
  },
];

describe("post-application mapping engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scores strong deterministic candidates highly", () => {
    const candidate = __private__.scoreJobCandidate(baseMessage, jobs[1]);
    expect(candidate.score).toBeGreaterThanOrEqual(80);
    expect(candidate.reasons.length).toBeGreaterThan(0);
  });

  it("uses deterministic match directly when >=95", async () => {
    const message: PostApplicationMessage = {
      ...baseMessage,
      subject:
        "Thanks for applying to Roku Interactive Front End JavaScript Developer",
      snippet:
        "Roku Interactive application received for Front End JavaScript Developer",
    };

    const result = await runJobMappingForMessage({
      message,
      jobsOverride: [jobs[1]],
    });
    expect(result.matchedJobId).toBe("job-2");
    expect(result.usedLlmRerank).toBe(false);
  });

  it("uses LLM rerank when deterministic score is 60-94", async () => {
    const message: PostApplicationMessage = {
      ...baseMessage,
      subject: "Application update for Front End Developer",
      snippet:
        "Your Front End Developer application has moved to the next stage",
      classificationPayload: {
        companyName: "Roku",
        jobTitle: "Front End Developer",
      },
    };

    const result = await runJobMappingForMessage({
      message,
      jobsOverride: jobs,
    });
    expect(result.usedLlmRerank).toBe(true);
    expect(result.matchedJobId).toBe("job-2");
  });

  it("returns no reliable match when deterministic score is below 60", async () => {
    const message: PostApplicationMessage = {
      ...baseMessage,
      fromDomain: "example.com",
      subject: "Application update",
      snippet: "Status update",
      classificationPayload: {
        companyName: "Unknown",
        jobTitle: "Unknown",
      },
    };

    const result = await runJobMappingForMessage({
      message,
      jobsOverride: [jobs[0]],
    });
    expect(result.matchedJobId).toBeNull();
    expect(result.usedLlmRerank).toBe(false);
  });
});
