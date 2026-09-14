import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";
import { extractRows } from "./xlsx";

// ESDC quarterly list of employers issued a positive Labour Market Impact
// Assessment (LMIA) — the public signal that an employer hires temporary
// foreign workers in Canada. Quarters are published as XLSX resources on the
// open.canada.ca dataset; the newest English quarter is resolved via the CKAN
// API instead of hardcoding a download URL.
const CKAN_PACKAGE_URL =
  "https://open.canada.ca/data/api/action/package_show?id=90fed587-1364-4f33-a9ee-208181dc0b97";

const QUARTER_PATTERN = /^(\d{4})Q(\d)/;

const NO_RESOURCE_MESSAGE =
  "Could not find a positive-LMIA XLSX resource on the open.canada.ca dataset";
const EMPTY_LIST_MESSAGE = "Canada LMIA list appears empty or invalid";

interface CkanResource {
  name?: string;
  url?: string;
  format?: string;
  language?: string[];
}

export function pickLatestQuarterResource(
  payload: unknown,
): { url: string; quarter: string } | null {
  const resources = (
    payload as { result?: { resources?: CkanResource[] } } | null
  )?.result?.resources;
  if (!Array.isArray(resources)) return null;

  let best: { url: string; quarter: string; rank: number } | null = null;
  for (const resource of resources) {
    const name = resource?.name ?? "";
    const match = QUARTER_PATTERN.exec(name);
    if (!match) continue;
    if ((resource.format ?? "").toUpperCase() !== "XLSX") continue;
    if (resource.language && !resource.language.includes("en")) continue;
    if (!/positive/i.test(name)) continue;
    if (!resource.url) continue;

    const rank = Number(match[1]) * 10 + Number(match[2]);
    if (!best || rank > best.rank) {
      best = { url: resource.url, quarter: `${match[1]}Q${match[2]}`, rank };
    }
  }

  return best ? { url: best.url, quarter: best.quarter } : null;
}

export function parseLmiaRows(
  rows: string[][],
  quarter: string,
): VisaSponsor[] {
  // The sheet has title rows before the header; locate the header by its
  // "Employer" column, then map columns by name (layout drifted across years).
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => /^employer$/i.test(cell)),
  );
  if (headerIndex === -1) return [];

  const header = rows[headerIndex].map((cell) => cell.toLowerCase());
  const col = (pattern: RegExp) =>
    header.findIndex((cell) => pattern.test(cell));
  const employerCol = col(/^employer$/);
  const provinceCol = col(/province/);
  const streamCol = col(/stream/);
  const addressCol = col(/address/);
  const positionsCol = col(/positions/);

  const sponsors: VisaSponsor[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const organisationName = row[employerCol] ?? "";
    if (!organisationName) continue;

    // Addresses read "City, PROV postal"; the city is the leading segment.
    const address = addressCol >= 0 ? (row[addressCol] ?? "") : "";
    const townCity = address.split(",")[0]?.trim() ?? "";
    const positions = positionsCol >= 0 ? Number(row[positionsCol]) || 0 : 0;

    sponsors.push({
      organisationName,
      townCity,
      county: provinceCol >= 0 ? (row[provinceCol] ?? "") : "",
      typeRating: positions
        ? `LMIA positive employer (${quarter}: ${positions} approved positions)`
        : `LMIA positive employer (${quarter})`,
      route: streamCol >= 0 && row[streamCol] ? row[streamCol].trim() : "TFWP",
    });
  }

  return sponsors;
}

export const manifest: VisaSponsorProviderManifest = {
  id: "ca",
  displayName: "Canada",
  countryKey: "canada",
  scheduledUpdateHour: 5,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    const packageResponse = await fetch(CKAN_PACKAGE_URL);
    if (!packageResponse.ok) {
      throw new Error(
        `Failed to query open.canada.ca: ${packageResponse.status} ${packageResponse.statusText}`,
      );
    }

    const resource = pickLatestQuarterResource(await packageResponse.json());
    if (!resource) {
      throw new Error(NO_RESOURCE_MESSAGE);
    }

    const fileResponse = await fetch(resource.url);
    if (!fileResponse.ok) {
      throw new Error(
        `Failed to download LMIA list (${resource.quarter}): ${fileResponse.status} ${fileResponse.statusText}`,
      );
    }

    const rows = extractRows(new Uint8Array(await fileResponse.arrayBuffer()));
    const sponsors = parseLmiaRows(rows, resource.quarter);
    if (sponsors.length === 0) {
      throw new Error(EMPTY_LIST_MESSAGE);
    }

    return sponsors;
  },
};

export default manifest;
