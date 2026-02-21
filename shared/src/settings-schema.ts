import { z } from "zod";
import { resumeProjectsSchema, settingsRegistry } from "./settings-registry";

export { resumeProjectsSchema };

type RegistryKeys = keyof typeof settingsRegistry;

type UpdateSchemaShape = {
  [K in RegistryKeys]: (typeof settingsRegistry)[K] extends {
    schema: z.ZodType<infer U, infer D, infer I>;
  }
    ? K extends "enableBasicAuth"
      ? z.ZodOptional<z.ZodType<U, D, I>>
      : z.ZodOptional<z.ZodNullable<z.ZodType<U, D, I>>>
    : z.ZodTypeAny;
};

const shape = Object.fromEntries(
  Object.entries(settingsRegistry).map(([key, def]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // biome-ignore lint/suspicious/noExplicitAny: def is dynamic
    const fieldSchema = (def as any).schema as z.ZodTypeAny;
    if (key === "enableBasicAuth") {
      return [key, fieldSchema.optional()];
    }
    return [key, fieldSchema.nullable().optional()];
  }),
) as unknown as UpdateSchemaShape;

export const updateSettingsSchema = z.object(shape).superRefine((data, ctx) => {
  if (data.enableBasicAuth) {
    if (
      !data.basicAuthUser ||
      typeof data.basicAuthUser !== "string" ||
      data.basicAuthUser.trim() === ""
    ) {
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
