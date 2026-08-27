import { createRequire } from "node:module";
import type {
  UpworkApifyClient,
  UpworkApifyInput,
  UpworkApifyItem,
} from "./types";

export const DEFAULT_UPWORK_APIFY_ACTOR_ID = "blackfalcondata/upwork-scraper";

const require = createRequire(import.meta.url);
const { ApifyClient } = require("apify-client") as {
  ApifyClient: new (options: {
    token: string | undefined;
  }) => UpworkApifyClient;
};

function toPositiveIntOrFallback(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

function normalizeLocation(location: string | undefined): string[] | undefined {
  const trimmed = location?.trim();
  if (!trimmed || trimmed.toLowerCase() === "worldwide") return undefined;
  return [trimmed];
}

export function resolveUpworkApifyActorId(actorId?: string): string {
  return (
    actorId?.trim() ||
    process.env.UPWORK_APIFY_ACTOR_ID?.trim() ||
    DEFAULT_UPWORK_APIFY_ACTOR_ID
  );
}

export function buildUpworkApifyInput(args: {
  query: string;
  location?: string;
  maxJobsPerTerm?: number;
}): UpworkApifyInput {
  const maxResults = toPositiveIntOrFallback(args.maxJobsPerTerm, 50);
  const location = normalizeLocation(args.location);

  return {
    query: args.query,
    ...(location ? { location } : {}),
    maxResults,
    sort: "recency",
    enrichDetails: false,
  };
}

export async function fetchUpworkApifyItems(args: {
  query: string;
  location?: string;
  maxJobsPerTerm?: number;
  token?: string;
  actorId?: string;
  client?: UpworkApifyClient;
}): Promise<UpworkApifyItem[]> {
  const actorId = resolveUpworkApifyActorId(args.actorId);
  const input = buildUpworkApifyInput({
    query: args.query,
    location: args.location,
    maxJobsPerTerm: args.maxJobsPerTerm,
  });

  const client =
    args.client ??
    (new ApifyClient({ token: args.token }) as unknown as UpworkApifyClient);

  try {
    const run = await client.actor(actorId).call(input);
    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems({ limit: input.maxResults });

    return items as UpworkApifyItem[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Upwork Apify actor ${actorId} failed for "${args.query}": ${message}`,
    );
  }
}
