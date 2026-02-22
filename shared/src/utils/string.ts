export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripHtmlTags(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]*>/g, " "));
}
