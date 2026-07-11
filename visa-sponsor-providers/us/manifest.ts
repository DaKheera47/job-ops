import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";

// USCIS H-1B Employer Data Hub yearly export. Employers that petitioned for
// H-1B workers, with approval counts — the closest public equivalent of a
// "sponsor register" for the US. Files are published per fiscal year at a
// stable path; the latest available year is discovered by probing downwards.
const DATA_URL = (fiscalYear: number) =>
  `https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-${fiscalYear}.csv`;

const OLDEST_FISCAL_YEAR = 2019;

const EMPTY_EXPORT_MESSAGE = "US H-1B export appears empty or invalid";

// Header: "Fiscal Year",Employer,"Initial Approval","Initial Denial",
// "Continuing Approval","Continuing Denial",NAICS,"Tax ID",State,City,ZIP
const COLUMNS = {
  employer: 1,
  initialApproval: 2,
  continuingApproval: 4,
  state: 8,
  city: 9,
} as const;

function parseCsvLine(line: string): string[] {
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

export function parseH1bExport(
  content: string,
  fiscalYear: number,
): VisaSponsor[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  // Employers appear once per NAICS code; aggregate approvals per employer.
  const byEmployer = new Map<
    string,
    { approvals: number; city: string; state: string }
  >();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const employer = fields[COLUMNS.employer] ?? "";
    if (!employer) continue;

    const approvals =
      (Number(fields[COLUMNS.initialApproval]) || 0) +
      (Number(fields[COLUMNS.continuingApproval]) || 0);

    const existing = byEmployer.get(employer);
    if (existing) {
      existing.approvals += approvals;
      if (!existing.city) existing.city = fields[COLUMNS.city] ?? "";
      if (!existing.state) existing.state = fields[COLUMNS.state] ?? "";
    } else {
      byEmployer.set(employer, {
        approvals,
        city: fields[COLUMNS.city] ?? "",
        state: fields[COLUMNS.state] ?? "",
      });
    }
  }

  const sponsors: VisaSponsor[] = [];
  for (const [organisationName, data] of byEmployer) {
    if (data.approvals === 0) continue;

    sponsors.push({
      organisationName,
      townCity: data.city,
      county: data.state,
      typeRating: `H-1B employer (FY${fiscalYear}: ${data.approvals} approvals)`,
      route: "H-1B",
    });
  }

  return sponsors;
}

async function fetchLatestExport(): Promise<{
  content: string;
  fiscalYear: number;
}> {
  const currentYear = new Date().getFullYear();
  let lastError = `no export found between FY${OLDEST_FISCAL_YEAR} and FY${currentYear + 1}`;

  for (let year = currentYear + 1; year >= OLDEST_FISCAL_YEAR; year--) {
    const response = await fetch(DATA_URL(year));
    if (!response.ok) {
      lastError = `FY${year}: ${response.status} ${response.statusText}`;
      continue;
    }
    return { content: await response.text(), fiscalYear: year };
  }

  throw new Error(`Failed to download US H-1B export: ${lastError}`);
}

export const manifest: VisaSponsorProviderManifest = {
  id: "us",
  displayName: "United States",
  countryKey: "united states",
  scheduledUpdateHour: 4,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    const { content, fiscalYear } = await fetchLatestExport();
    const sponsors = parseH1bExport(content, fiscalYear);
    if (sponsors.length === 0) {
      throw new Error(EMPTY_EXPORT_MESSAGE);
    }

    return sponsors;
  },
};

export default manifest;
