// rxresume/v4.ts
// Service wrapper around the v4 client that mirrors the v5 helper API.
// - Pulls credentials from env/settings.
// - Validates resume payloads.
// - Keeps the rest of the app v5-ready (swap imports later).

import { getSetting } from "@server/repositories/settings";
import { RxResumeClient, type RxResumeResume } from "./client";
import { parseV4ResumeData, type ResumeData } from "./schema/v4";

export type RxResumeCredentials = {
  email: string;
  password: string;
  baseUrl: string;
};

export type RxResumeImportPayload = {
  name?: string;
  slug?: string;
  data: ResumeData;
};

export class RxResumeCredentialsError extends Error {
  constructor() {
    super(
      "RxResume credentials not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD in environment or settings.",
    );
    this.name = "RxResumeCredentialsError";
  }
}

async function resolveRxResumeCredentials(
  override?: Partial<RxResumeCredentials>,
): Promise<RxResumeCredentials> {
  const baseUrlRaw =
    override?.baseUrl ?? process.env.RXRESUME_URL ?? "https://v4.rxresu.me";
  const baseUrl = baseUrlRaw.trim() || "https://v4.rxresu.me";
  const overrideEmail = override?.email?.trim() ?? "";
  const overridePassword = override?.password?.trim() ?? "";

  let email = overrideEmail || process.env.RXRESUME_EMAIL || "";
  let password = overridePassword || process.env.RXRESUME_PASSWORD || "";

  if (!email) {
    email = (await getSetting("rxresumeEmail")) || "";
  }
  if (!password) {
    password = (await getSetting("rxresumePassword")) || "";
  }

  if (!email || !password) {
    throw new RxResumeCredentialsError();
  }

  return { email, password, baseUrl };
}

async function withRxResumeClient<T>(
  override: Partial<RxResumeCredentials> | undefined,
  operation: (client: RxResumeClient, token: string) => Promise<T>,
): Promise<T> {
  const { email, password, baseUrl } =
    await resolveRxResumeCredentials(override);
  const client = new RxResumeClient(baseUrl);
  return client.withAutoRefresh(email, password, (token) =>
    operation(client, token),
  );
}

export async function listResumes(
  override?: Partial<RxResumeCredentials>,
): Promise<RxResumeResume[]> {
  return withRxResumeClient(override, (client, token) => client.list(token));
}

export async function getResume(
  resumeId: string,
  override?: Partial<RxResumeCredentials>,
): Promise<RxResumeResume> {
  const resume = await withRxResumeClient(override, (client, token) =>
    client.get(resumeId, token),
  );
  if (resume.data) {
    resume.data = parseV4ResumeData(resume.data) as ResumeData;
  }
  return resume;
}

export async function importResume(
  payload: RxResumeImportPayload,
  override?: Partial<RxResumeCredentials>,
): Promise<string> {
  const data = parseV4ResumeData(payload.data) as ResumeData;
  const title = payload.name?.trim() || undefined;
  const slug = payload.slug?.trim() || undefined;

  return withRxResumeClient(override, (client, token) =>
    client.create(data, token, { title, slug }),
  );
}

export async function deleteResume(
  resumeId: string,
  override?: Partial<RxResumeCredentials>,
): Promise<void> {
  return withRxResumeClient(override, (client, token) =>
    client.delete(resumeId, token),
  );
}

export async function exportResumePdf(
  resumeId: string,
  override?: Partial<RxResumeCredentials>,
): Promise<string> {
  return withRxResumeClient(override, (client, token) =>
    client.print(resumeId, token),
  );
}
