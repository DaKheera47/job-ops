/**
 * Normalize text for ATS (Applicant Tracking System) compatibility.
 *
 * LLMs frequently produce Unicode characters (em-dashes, smart quotes,
 * zero-width chars) that ATS parsers misinterpret or drop when scanning
 * PDF resumes. This function replaces them with safe ASCII equivalents.
 *
 * Only apply to plain-text fields (headline, summary, skill keywords).
 * Do NOT use on HTML, URLs, or structured data.
 */
export function normalizeTextForATS(text: string): string {
  return (
    text
      // Dashes → ASCII hyphen
      .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")
      // Bullet → hyphen
      .replace(/\u2022/g, "-")
      // Smart double quotes → straight double quote
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Smart single quotes → straight apostrophe
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      // Ellipsis → three dots
      .replace(/\u2026/g, "...")
      // Zero-width characters → removed
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "")
      // Non-breaking space → regular space
      .replace(/\u00A0/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}
