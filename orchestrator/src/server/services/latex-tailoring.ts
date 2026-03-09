import { logger } from "@infra/logger";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "you",
  "your",
  "we",
  "our",
  "this",
  "these",
  "those",
  "will",
  "can",
  "using",
  "use",
  "have",
  "has",
  "had",
  "into",
  "over",
  "under",
  "about",
  "role",
  "team",
  "work",
  "job",
  "experience",
  "years",
]);

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9+#.-]+$/g, "")
    .replace(/[.,;:]+$/g, "");
}

export function extractKeywords(text: string, maxKeywords = 30): string[] {
  const counts = new Map<string, number>();
  const matches = text.match(/[a-zA-Z0-9][a-zA-Z0-9+#.-]*/g) ?? [];

  for (const raw of matches) {
    const token = normalizeToken(raw);
    if (!token) continue;
    if (token.length < 2) continue;
    if (STOP_WORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxKeywords)
    .map(([token]) => token);
}

function buildKeywordWeights(keywords: string[]): Map<string, number> {
  const max = Math.max(keywords.length, 1);
  return new Map(
    keywords.map((keyword, index) => [keyword.toLowerCase(), max - index]),
  );
}

export function scoreTextRelevance(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  const weights = buildKeywordWeights(keywords);
  let score = 0;

  for (const [keyword, weight] of weights.entries()) {
    if (normalized.includes(keyword)) {
      score += weight;
    }
  }

  return score;
}

export function reorderByKeywordRelevance<T>(
  items: T[],
  getText: (item: T) => string,
  keywords: string[],
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreTextRelevance(getText(item), keywords),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function reorderCommaSeparatedList(listText: string, keywords: string[]): string {
  const entries = listText
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length < 2) return listText;
  return reorderByKeywordRelevance(entries, (entry) => entry, keywords).join(
    ", ",
  );
}

function reorderItemizeBlock(content: string, keywords: string[]): string {
  const lines = content.split("\n");
  const prefix: string[] = [];
  const items: string[] = [];
  let currentItem: string[] | null = null;

  for (const line of lines) {
    if (line.trim().startsWith("\\item")) {
      if (currentItem) items.push(currentItem.join("\n"));
      currentItem = [line];
      continue;
    }

    if (currentItem) {
      currentItem.push(line);
    } else {
      prefix.push(line);
    }
  }

  if (currentItem) items.push(currentItem.join("\n"));
  if (items.length < 2) return content;

  const reordered = reorderByKeywordRelevance(
    items,
    (item) => item.replace(/\\item\s*/g, ""),
    keywords,
  );
  return [...prefix, ...reordered].join("\n");
}

export function reorderLatexItemizeBullets(
  template: string,
  keywords: string[],
): string {
  return template.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_match, body: string) => {
      const reordered = reorderItemizeBlock(body, keywords);
      return `\\begin{itemize}${reordered}\\end{itemize}`;
    },
  );
}

function reorderSkillLine(line: string, keywords: string[]): string {
  const skillLinePattern = /(skill|technology|tech|stack|language|tool)/i;
  if (!skillLinePattern.test(line) || !line.includes(",")) return line;

  const colonIndex = line.indexOf(":");
  if (colonIndex !== -1) {
    const prefix = line.slice(0, colonIndex + 1);
    const remainder = line.slice(colonIndex + 1);
    const lineBreakIndex = remainder.indexOf("\\\\");
    const listSegment =
      lineBreakIndex >= 0 ? remainder.slice(0, lineBreakIndex) : remainder;
    const suffix = lineBreakIndex >= 0 ? remainder.slice(lineBreakIndex) : "";
    return `${prefix} ${reorderCommaSeparatedList(listSegment, keywords)}${suffix}`;
  }

  return line.replace(/\{([^{}]*,[^{}]*)\}/, (_match, segment: string) => {
    return `{${reorderCommaSeparatedList(segment, keywords)}}`;
  });
}

export function reorderLatexSkillLists(
  template: string,
  keywords: string[],
): string {
  return template
    .split("\n")
    .map((line) => reorderSkillLine(line, keywords))
    .join("\n");
}

function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([%$#&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function applySubstitutions(
  template: string,
  substitutions: Record<string, string>,
): string {
  let output = template;
  for (const [key, value] of Object.entries(substitutions)) {
    output = output.replaceAll(`{{${key}}}`, escapeLatexText(value));
  }
  return output;
}

export function tailorLatexTemplate(args: {
  template: string;
  keywordContext: string;
  substitutions?: Record<string, string>;
}): { content: string; keywords: string[] } {
  const keywords = extractKeywords(args.keywordContext, 40);
  let content = args.template;

  if (keywords.length > 0) {
    content = reorderLatexItemizeBullets(content, keywords);
    content = reorderLatexSkillLists(content, keywords);
  } else {
    logger.debug("No LaTeX tailoring keywords extracted from context");
  }

  if (args.substitutions) {
    content = applySubstitutions(content, args.substitutions);
  }

  return { content, keywords };
}
