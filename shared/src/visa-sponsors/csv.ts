import type { VisaSponsor } from "../types/visa-sponsors";

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

export function parseVisaSponsorsCsv(content: string): VisaSponsor[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const sponsors: VisaSponsor[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
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
