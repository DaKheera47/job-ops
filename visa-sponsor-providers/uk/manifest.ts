import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";

const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

const CSV_LINK_PATTERN =
  /href="(https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+Worker_and_Temporary_Worker\.csv)"/;

async function extractCsvUrl(): Promise<string> {
  const response = await fetch(GOV_UK_PAGE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gov.uk page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const match = html.match(CSV_LINK_PATTERN);
  if (!match) {
    throw new Error(
      "Could not find Worker and Temporary Worker CSV link on gov.uk page",
    );
  }

  return match[1];
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCsv(content: string): VisaSponsor[] {
  const lines = content.split("\n");
  const sponsors: VisaSponsor[] = [];

  // Skip header row at index 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length >= 5) {
      sponsors.push({
        organisationName: fields[0] || "",
        townCity: fields[1] || "",
        county: fields[2] || "",
        typeRating: fields[3] || "",
        route: fields[4] || "",
      });
    }
  }

  return sponsors;
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
    const sponsors = parseCsv(content);
    if (sponsors.length === 0) {
      throw new Error("UK sponsor CSV appears empty or invalid");
    }

    return sponsors;
  },
};

export default manifest;
