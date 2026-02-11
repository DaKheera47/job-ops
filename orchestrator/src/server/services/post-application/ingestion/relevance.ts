export const POST_APPLICATION_RELEVANCE_HIGH_CONFIDENCE_THRESHOLD = 95;
export const POST_APPLICATION_RELEVANCE_MIN_THRESHOLD = 60;

type Rule = {
  term: string;
  weight: number;
};

const SUBJECT_RULES: Rule[] = [
  { term: "thank you for applying", weight: 45 },
  { term: "thanks for applying", weight: 45 },
  { term: "application received", weight: 45 },
  { term: "application submitted", weight: 45 },
  { term: "interview", weight: 35 },
  { term: "assessment", weight: 35 },
  { term: "offer", weight: 35 },
  { term: "rejection", weight: 35 },
  { term: "regret to inform", weight: 35 },
  { term: "not moving forward", weight: 35 },
  { term: "hiring team", weight: 25 },
  { term: "recruiter", weight: 25 },
  { term: "referral", weight: 25 },
];

const FROM_RULES: Rule[] = [
  { term: "careers@", weight: 40 },
  { term: "jobs@", weight: 40 },
  { term: "recruiting@", weight: 40 },
  { term: "talent@", weight: 40 },
  { term: "@greenhouse.io", weight: 35 },
  { term: "@greenhouse-mail.io", weight: 35 },
  { term: "@lever.co", weight: 35 },
  { term: "@smartrecruiters.com", weight: 35 },
  { term: "@workdaymail.com", weight: 35 },
  { term: "@myworkday.com", weight: 35 },
  { term: "@workablemail.com", weight: 35 },
  { term: "@ashbyhq.com", weight: 35 },
];

const SNIPPET_RULES: Rule[] = [
  { term: "we have received your application", weight: 45 },
  { term: "thank you for your application", weight: 45 },
  { term: "please share your availability", weight: 40 },
  { term: "interview", weight: 35 },
  { term: "assessment", weight: 35 },
  { term: "coding challenge", weight: 35 },
  { term: "offer", weight: 35 },
  { term: "not moving forward", weight: 35 },
  { term: "regret to inform", weight: 35 },
];

const EXCLUSION_TERMS = [
  "newsletter",
  "weekly roundup",
  "course",
  "promotion",
  "discount",
  "event invitation",
  "webinar",
  "unsubscribe",
];

function toHaystack(value: string): string {
  return value.trim().toLowerCase();
}

function matchScore(value: string, rules: Rule[]): number {
  const haystack = toHaystack(value);
  if (!haystack) return 0;

  let total = 0;
  for (const rule of rules) {
    if (haystack.includes(rule.term)) {
      total += rule.weight;
    }
  }
  return total;
}

export function computeKeywordRelevanceScore(args: {
  from: string;
  subject: string;
  snippet: string;
}): number {
  const from = toHaystack(args.from);
  const subject = toHaystack(args.subject);
  const snippet = toHaystack(args.snippet);
  const joined = `${subject} ${snippet}`;

  if (EXCLUSION_TERMS.some((term) => joined.includes(term))) {
    return 0;
  }

  const score =
    matchScore(subject, SUBJECT_RULES) +
    matchScore(from, FROM_RULES) +
    matchScore(snippet, SNIPPET_RULES);

  return Math.max(0, Math.min(100, score));
}

type KeywordClassification =
  | "Application confirmation"
  | "Interview invitation"
  | "Assessment sent"
  | "Offer made"
  | "Rejection"
  | "Availability request"
  | "Referral - Action required"
  | "False positive";

export function classifyByKeywords(args: {
  subject: string;
  snippet: string;
}): KeywordClassification {
  const text = toHaystack(`${args.subject} ${args.snippet}`);

  if (
    text.includes("not moving forward") ||
    text.includes("regret to inform") ||
    text.includes("rejection")
  ) {
    return "Rejection";
  }
  if (text.includes("offer")) return "Offer made";
  if (
    text.includes("availability") ||
    text.includes("when are you free") ||
    text.includes("please share your availability")
  ) {
    return "Availability request";
  }
  if (
    text.includes("assessment") ||
    text.includes("coding challenge") ||
    text.includes("take-home")
  ) {
    return "Assessment sent";
  }
  if (
    text.includes("interview") ||
    text.includes("schedule") ||
    text.includes("invitation")
  ) {
    return "Interview invitation";
  }
  if (text.includes("referral") || text.includes("referred")) {
    return "Referral - Action required";
  }
  if (
    text.includes("thank you for applying") ||
    text.includes("application received") ||
    text.includes("application submitted")
  ) {
    return "Application confirmation";
  }
  return "False positive";
}

export function computePolicyDecision(keywordScore: number): {
  shouldUseLlm: boolean;
  isRelevant: boolean;
} {
  if (keywordScore >= POST_APPLICATION_RELEVANCE_HIGH_CONFIDENCE_THRESHOLD) {
    return { shouldUseLlm: false, isRelevant: true };
  }
  if (keywordScore < POST_APPLICATION_RELEVANCE_MIN_THRESHOLD) {
    return { shouldUseLlm: false, isRelevant: false };
  }
  return { shouldUseLlm: true, isRelevant: false };
}
