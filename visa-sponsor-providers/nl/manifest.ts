import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";

// IND public register of recognised sponsors for the residence purpose
// "work" and "highly skilled migrant". Single HTML page, one table:
// <th scope="row">Organisation</th><td>KvK number</td> (~12k rows).
const IND_REGISTER_URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

const SPONSOR_ROW_PATTERN =
  /<th[^>]*scope=(["'])row\1[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;

const NO_SPONSORS_MESSAGE =
  "Could not find any recognised sponsors in the IND register page";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanCellText(cell: string): string {
  return decodeHtmlEntities(cell.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseIndRegisterHtml(html: string): VisaSponsor[] {
  const sponsors: VisaSponsor[] = [];

  for (const match of html.matchAll(SPONSOR_ROW_PATTERN)) {
    const organisationName = cleanCellText(match[2]);
    const kvkNumber = cleanCellText(match[3]);
    if (!organisationName) continue;

    sponsors.push({
      organisationName,
      townCity: "",
      county: "",
      // The register lists recognition, not location; the KvK number is the
      // only other public field and is kept for disambiguation.
      typeRating: kvkNumber
        ? `Recognised sponsor (KvK ${kvkNumber})`
        : "Recognised sponsor",
      route: "Work / Highly skilled migrant",
    });
  }

  return sponsors;
}

export const manifest: VisaSponsorProviderManifest = {
  id: "nl",
  displayName: "Netherlands",
  countryKey: "netherlands",
  scheduledUpdateHour: 3,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    const response = await fetch(IND_REGISTER_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch IND register page: ${response.status} ${response.statusText}`,
      );
    }

    const sponsors = parseIndRegisterHtml(await response.text());
    if (sponsors.length === 0) {
      throw new Error(NO_SPONSORS_MESSAGE);
    }

    return sponsors;
  },
};

export default manifest;
