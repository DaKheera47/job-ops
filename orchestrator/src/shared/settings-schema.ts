import { z } from "zod";

export const resumeProjectsSchema = z.object({
  maxProjects: z.number().int().min(0).max(100),
  lockedProjectIds: z.array(z.string().trim().min(1)).max(200),
  aiSelectableProjectIds: z.array(z.string().trim().min(1)).max(200),
});

export const updateSettingsSchema = z.object({
  model: z.string().trim().max(200).nullable().optional(),
  modelScorer: z.string().trim().max(200).nullable().optional(),
  modelTailoring: z.string().trim().max(200).nullable().optional(),
  modelProjectSelection: z.string().trim().max(200).nullable().optional(),
  pipelineWebhookUrl: z.string().trim().max(2000).nullable().optional(),
  jobCompleteWebhookUrl: z.string().trim().max(2000).nullable().optional(),
  resumeProjects: resumeProjectsSchema.nullable().optional(),
  rxresumeBaseResumeId: z.string().trim().max(200).nullable().optional(),
  ukvisajobsMaxJobs: z.number().int().min(1).max(1000).nullable().optional(),
  gradcrackerMaxJobsPerTerm: z.number().int().min(1).max(1000).nullable().optional(),
  searchTerms: z.array(z.string().trim().min(1).max(200)).max(100).nullable().optional(),
  jobspyLocation: z.string().trim().max(100).nullable().optional(),
  jobspyResultsWanted: z.number().int().min(1).max(1000).nullable().optional(),
  jobspyHoursOld: z.number().int().min(1).max(720).nullable().optional(),
  jobspyCountryIndeed: z.string().trim().max(100).nullable().optional(),
  jobspySites: z.array(z.string().trim().min(1).max(50)).max(20).nullable().optional(),
  jobspyLinkedinFetchDescription: z.boolean().nullable().optional(),
  showSponsorInfo: z.boolean().nullable().optional(),
  openrouterApiKey: z.string().trim().max(2000).nullable().optional(),
  rxresumeEmail: z.string().trim().max(200).nullable().optional(),
  rxresumePassword: z.string().trim().max(2000).nullable().optional(),
  basicAuthUser: z.string().trim().max(200).nullable().optional(),
  basicAuthPassword: z.string().trim().max(2000).nullable().optional(),
  ukvisajobsEmail: z.string().trim().max(200).nullable().optional(),
  ukvisajobsPassword: z.string().trim().max(2000).nullable().optional(),
  webhookSecret: z.string().trim().max(2000).nullable().optional(),
  enableBasicAuth: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.enableBasicAuth) {
    if (!data.basicAuthUser || data.basicAuthUser.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Username is required when basic auth is enabled",
        path: ["basicAuthUser"],
      });
    }
  }
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ResumeProjectsSettingsInput = z.infer<typeof resumeProjectsSchema>;
