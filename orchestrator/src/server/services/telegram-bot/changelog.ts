/**
 * Changelog entries for the Telegram bot notification system.
 *
 * Each entry represents a release with user-facing changes.
 * Entries are sent to all authorized chats on bot startup
 * if they haven't been sent yet, then pinned for easy access.
 *
 * Guidelines for writing entries:
 * - Use simple, non-technical language
 * - Explain WHAT changed and HOW it helps
 * - Include a brief instruction if the user needs to do something
 * - Keep each item to 1-2 lines
 * - Use emojis for visual scanning
 */

export interface ChangelogEntry {
  /** Unique version identifier (semver-like, e.g. "1.2.0"). Must be monotonically increasing. */
  version: string;
  /** Release date in YYYY-MM-DD format */
  date: string;
  /** Items in this release */
  items: ChangelogItem[];
}

export interface ChangelogItem {
  /** Emoji + short title */
  title: string;
  /** 1-2 sentence plain-language description */
  description: string;
  /** Optional tip or instruction */
  tip?: string;
}

/**
 * Changelog entries, newest first.
 * Only add entries HERE when shipping user-visible changes.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.5.0",
    date: "2026-05-07",
    items: [
      {
        title: "🔎 Search Command",
        description:
          "Quickly find any job by keyword. Searches across job title, company, and location at once.",
        tip: "Send /search <keyword> — e.g. /search Berlin, /search Senior PM, /search BMW.",
      },
      {
        title: "🚫 Confirm Before Blocking",
        description:
          "Tapping 🚫 Block Company now asks you to confirm before adding the company to your blocklist. No more accidental blocks.",
      },
      {
        title: "🗑 Delete Job & Clear Blocked Companies — Safer",
        description:
          "Destructive actions now show a confirmation step so you can cancel before anything is removed.",
      },
      {
        title: "📡 Boards — Pagination & Clearer Errors",
        description:
          "If you track many ATS boards, you can now page through them to remove any one. Errors during board operations now surface in chat instead of being silently swallowed.",
      },
      {
        title: "🧭 Faster Navigation",
        description:
          "Job detail now has a quick-jump row to Jobs, Stats, and Settings. Settings menu links directly to 📡 Boards.",
      },
      {
        title: "📋 Tap-to-Copy Link Code",
        description:
          "The link code shown in /link instructions can now be tapped to copy in one go.",
      },
      {
        title: "🚀 Apply Screen Refresh",
        description:
          "The auto-apply screen is clearer about what's available today (manual review with tailored CV, cover letter, and referral message) and what's coming.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05-07",
    items: [
      {
        title: "📝 Cover Letter Generator",
        description:
          "Generate a tailored PDF cover letter for any job on demand. The letter references specific details from the job description and maps your profile to the role's requirements.",
        tip: "Open a job → tap 📝 Cover Letter. Use 🔄 Regenerate Cover Letter to get a fresh version.",
      },
      {
        title: "🤝 Ask for Referral",
        description:
          "Generate a personalized LinkedIn message you can send to someone at the target company to ask for a referral. The message is tailored to the role, the company, and your background.",
        tip: "Open a job → tap 🤝 Ask for Referral → tap the message to copy it, then replace [Name] before sending on LinkedIn.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-04",
    items: [
      {
        title: "📋 SmartRecruiters Support",
        description:
          "Track jobs from SmartRecruiters companies like Visa, IKEA, Bosch, Sanofi, and more. Enter the company slug from jobs.smartrecruiters.com.",
        tip: 'Go to 📡 Boards → + Add → 📋 SmartRecruiters → enter slug (e.g. "Visa").',
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-04",
    items: [
      {
        title: "🏢 Workday Support",
        description:
          "Track jobs from Workday companies like BMW, Siemens, Intel, and thousands more. Just type the company name — the bot finds the careers page automatically.",
        tip: 'Go to 📡 Boards → + Add → 🏢 Workday → type "BMW" and the bot does the rest.',
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-05-03",
    items: [
      {
        title: "📡 ATS Board Scanner",
        description:
          "Track company career pages directly from Greenhouse, Ashby, and Lever — completely free, no AI tokens used.",
        tip: 'Tap "📡 Boards" in the main menu to add companies like Stripe, Anthropic, or Netflix.',
      },
      {
        title: "📄 Smarter PDF Resumes",
        description:
          "Your resumes now pass ATS scanners more reliably. Special characters that used to confuse automated screening are automatically cleaned up.",
      },
    ],
  },
];

/**
 * Get the latest changelog version.
 */
export function getLatestChangelogVersion(): string {
  return CHANGELOG.length > 0 ? CHANGELOG[0].version : "0.0.0";
}

/**
 * Get all changelog entries newer than a given version.
 * Returns entries in newest-first order.
 */
export function getChangelogSince(
  sinceVersion: string | null,
): ChangelogEntry[] {
  if (!sinceVersion) return CHANGELOG;
  const sinceIndex = CHANGELOG.findIndex((e) => e.version === sinceVersion);
  if (sinceIndex === -1) return CHANGELOG; // Unknown version → send all
  return CHANGELOG.slice(0, sinceIndex);
}

/**
 * Format changelog entries into a single HTML message for Telegram.
 */
export function formatChangelogMessage(entries: ChangelogEntry[]): string {
  if (entries.length === 0) return "";

  const latestVersion = entries[0].version;
  const lines: string[] = [
    `<b>📢 What's New — v${latestVersion}</b>`,
    "",
  ];

  for (const entry of entries) {
    for (const item of entry.items) {
      lines.push(`<b>${item.title}</b>`);
      lines.push(item.description);
      if (item.tip) {
        lines.push(`💡 <i>${item.tip}</i>`);
      }
      lines.push("");
    }
  }

  lines.push("Questions? Send /menu to explore.");

  return lines.join("\n").trim();
}
