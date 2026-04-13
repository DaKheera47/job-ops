import { normalizeWhitespace } from "./utils/string";

const COMPANY_SUFFIXES = [
  "limited",
  "ltd",
  "llp",
  "plc",
  "inc",
  "incorporated",
  "corporation",
  "corp",
  "company",
  "co",
  "llc",
  "uk",
  "international",
  "intl",
  "group",
  "holdings",
  "t/a",
  "trading as",
  "&",
  "the",
];

function normalizeMatchText(value: string): string {
  const normalized = value.toLowerCase().trim();
  return normalizeWhitespace(
    normalized.replace(/[.,'"()[\]{}!?@#$%^&*+=|\\/<>:;`~_-]/g, " "),
  );
}

export function normalizeCompanyName(name: string): string {
  let normalized = normalizeMatchText(name);
  for (const suffix of COMPANY_SUFFIXES) {
    const regex = new RegExp(`\\b${suffix}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }
  return normalizeWhitespace(normalized);
}

export function normalizeJobTitle(title: string): string {
  return normalizeMatchText(title);
}

export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  if (s1.includes(s2) || s2.includes(s1)) {
    const longerLen = Math.max(s1.length, s2.length);
    const shorterLen = Math.min(s1.length, s2.length);
    return Math.round((shorterLen / longerLen) * 100);
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}
