import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";
import { parseVisaSponsorsCsv } from "@shared/visa-sponsors/csv";

const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

const GOV_UK_ASSET_PREFIX = "https://assets.publishing.service.gov.uk/media/";
const CSV_HREF_PATTERN = /href=(["'])([^"']+\.csv(?:\?[^"']*)?)\1/gi;
const CSV_LINK_NOT_FOUND_MESSAGE =
  "Could not find Worker and Temporary Worker CSV link on gov.uk page";

function normalizeCsvUrl(url: string): string {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep the original URL if GOV.UK ever serves a malformed escape sequence.
  }

  return decoded
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractWorkerTemporaryWorkerCsvUrl(
  html: string,
): string | null {
  for (const match of html.matchAll(CSV_HREF_PATTERN)) {
    const url = match[2].replace(/&amp;/g, "&");
    if (!url.startsWith(GOV_UK_ASSET_PREFIX)) continue;

    const normalized = normalizeCsvUrl(url);
    const withoutTemporaryWorker = normalized.replace(/temporary worker/g, "");
    if (
      normalized.includes("temporary worker") &&
      withoutTemporaryWorker.includes("worker")
    ) {
      return url;
    }
  }

  return null;
}

async function extractCsvUrl(): Promise<string> {
  const response = await fetch(GOV_UK_PAGE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gov.uk page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const csvUrl = extractWorkerTemporaryWorkerCsvUrl(html);
  if (!csvUrl) {
    throw new Error(CSV_LINK_NOT_FOUND_MESSAGE);
  }

  return csvUrl;
}

export const manifest: VisaSponsorProviderManifest = {
  id: "uk",
  displayName: "United Kingdom",
  countryKey: "united kingdom",
  scheduledUpdateHour: 2,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    const csvUrl = await extractCsvUrl();
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download UK sponsor CSV: ${response.status} ${response.statusText}`,
      );
    }

    const content = await response.text();
    const sponsors = parseVisaSponsorsCsv(content);
    if (sponsors.length === 0) {
      throw new Error("UK sponsor CSV appears empty or invalid");
    }

    return sponsors;
  },
};

export default manifest;
