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
    version: "1.10.0",
    date: "2026-05-14",
    items: [
      {
        title: "🌍 Multi-Country JobSpy",
        description:
          "Indeed and LinkedIn searches now run across 6 countries in parallel: Germany, UAE (Dubai), Cyprus, Israel, Netherlands and Switzerland. This unlocks remote roles from Russian-speaking IT hubs (Cyprus, Israel) and high-salary EU markets (NL, CH) — all hits feed into the same pipeline as global remote.",
      },
      {
        title: "🔧 NoFluffJobs Reconnected",
        description:
          "Their public API switched from POST to GET — we returned 0 jobs for a while. Fixed. Expect ~20,000 PM/tech postings from EU again, with a remote filter applied at the source.",
      },
      {
        title: "⚠️ HH.ru Disabled",
        description:
          "HeadHunter.ru aggressively geo-blocks API requests outside CIS IP ranges, so it's been silently returning 'forbidden' from our Munich server. Removed from the active remote rotation to stop wasting cycles. Code is still in place — works automatically if you ever run the pipeline from a CIS IP.",
        tip: "For CIS coverage from EU, Djinni.co is a strong public-API alternative. Ping me to add it as a new source if needed.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-05-12",
    items: [
      {
        title: "🔍 Much Wider Search",
        description:
          "Per-source result caps raised from 4 → 50 per search term. Indeed, LinkedIn, Glassdoor, Adzuna, startup.jobs and Seek now each pull up to 50 jobs per keyword — that's roughly a 10–15× increase in raw coverage every pipeline run.",
      },
      {
        title: "🏢 31 New ATS Companies Added",
        description:
          "Tracking expanded to 35 company career boards including GitLab, Anthropic, OpenAI, Stripe, Figma, Notion, Doist, Automattic, Vercel, Linear, Coinbase, Mozilla, Hugging Face and 18 more. These surface exclusive listings that don't appear on LinkedIn or Indeed.",
      },
      {
        title: "🌐 Remote-First Scope",
        description:
          "Location pin removed (was Munich) and workplace types narrowed to remote + hybrid. The pipeline now scans worldwide for remote roles instead of being anchored to one city.",
      },
      {
        title: "🧹 Low-fit Auto-skip",
        description:
          "Jobs scoring below 40/100 are automatically moved to the 'skipped' bucket so the Ready list stays clean. Below 55 they don't even get a tailored PDF generated. You'll only see jobs the system thinks are worth your time.",
        tip: "Use /insights to monitor how many jobs were auto-skipped per week. If too few real matches survive, ping me to lower the threshold.",
      },
      {
        title: "📈 Higher Throughput",
        description:
          "Pipeline now processes the top 20 ranked jobs per run (up from 10), keeping pace with the higher inflow without falling behind.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-05-11",
    items: [
      {
        title: "📬 Auto Gmail Sync",
        description:
          "Your Gmail inbox is now polled every 2 hours and post-application emails are auto-classified. When an email is a confident match (95%+) the job stage is updated automatically; otherwise the email shows up in the Tracking Inbox.",
        tip: "Tap 📬 Email Sync in the main menu, or send /sync to trigger a manual run, or /gmail_status to check the scheduler. First-time setup: connect olga.fadeeva.job@gmail.com via Settings → Tracking Inbox in the web app.",
      },
      {
        title: "🔔 Per-email Telegram reports",
        description:
          "Every new processed email lands here as a chat message: who sent it, the subject, which job matched, what stage was applied, and the Smart Router's confidence. Spam and irrelevant emails are filtered out so the chat doesn't get noisy.",
      },
      {
        title: "🛡 Reliability guarantees",
        description:
          "No duplicate notifications even if the sync re-reads the same email later. If Gmail fails 3 polls in a row you get a single 'reconnect needed' alert instead of a flood. Sync skips itself if a run is already in flight.",
      },
      {
        title: "✉️ Updated resume email",
        description:
          "Resumes and cover letters now use olga.fadeeva.job@gmail.com — the dedicated job-search inbox. Any future PDF generation uses the new address automatically.",
      },
    ],
  },
  {
    version: "1.7.1",
    date: "2026-05-10",
    items: [
      {
        title: "🔌 Auto-Enabled Remote Sources",
        description:
          "When you pick Selected + Remote or Remote Worldwide as your scope, the pipeline automatically pulls from WeWorkRemotely, Remotive, RemoteOK, Himalayas, JustJoin.it, NoFluffJobs, hh.ru and Working Nomads. No need to enable each one manually.",
        tip: "Open Pipeline → 🌐 Scope and switch to 'Selected + Remote' or 'Remote Worldwide'. The Review screen now shows the active source list.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-05-10",
    items: [
      {
        title: "🌐 7 New Job Sources for Remote-First Search",
        description:
          "Pipeline now covers WeWorkRemotely, Remotive, RemoteOK, Himalayas, JustJoin.it, NoFluffJobs and HeadHunter (hh.ru). Most are 100% remote, the EU ones surface Polish/Czech companies that hire across Europe, and HH.ru exposes English-speaking remote roles relevant to candidates from the Russian-speaking world.",
        tip: "Open Settings → Pipeline → Sources to enable any combination. Sources are opt-in, so they won't affect your current run until you switch them on.",
      },
      {
        title: "💼 Better remote-only matching",
        description:
          "When your workplace preferences are set to Remote only, these new sources are auto-tuned to ask their APIs for fully-remote postings — fewer irrelevant onsite roles slip through.",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-05-10",
    items: [
      {
        title: "📈 Insights Dashboard",
        description:
          "Get a data-driven view of your job-search funnel: pipeline efficiency, response rates by score band, top missing skills, and recommended score thresholds.",
        tip: "Tap 📈 Insights in the main menu, or send /insights. Switch the time window between 7d / 30d / 90d.",
      },
      {
        title: "🎤 Interview Prep — Story Bank & Question Bank",
        description:
          "Build a STAR+R story bank that grows with every application, plus a tagged interview-question bank with confidence ratings. Pull from them before any interview.",
        tip: "Tap 🎤 Interview Prep in the main menu, or send /interview. ⭐ mark your strongest 5-10 stories as 'master' so you can bend them to any question.",
      },
      {
        title: "🧩 Richer Job Match Analysis",
        description:
          "Each scored job now shows requirements you meet, requirements you're missing, transferable skills, deal-breakers, and concrete tailoring tips — not just a single score.",
        tip: "Open any scored job to see the new 🧩 Match section.",
      },
      {
        title: "👻 Ghost-Job Detector",
        description:
          "Listings that look like reposts, expired postings, or vague hype roles are now flagged in your job list and on the job card so you can avoid wasting time on dead ends.",
        tip: "Look for the 🔴 / 🟡 / 🟢 indicator on jobs. Signals are listed on each job card.",
      },
      {
        title: "🚦 Pre-Queue Liveness Check",
        description:
          "Discovered URLs that return a hard 404/410 are dropped before they're added to your pipeline — fewer dead jobs, less noise.",
      },
    ],
  },
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
function escapeChangelogHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatChangelogMessage(entries: ChangelogEntry[]): string {
  if (entries.length === 0) return "";

  const latestVersion = entries[0].version;
  const lines: string[] = [
    `<b>📢 What's New — v${escapeChangelogHtml(latestVersion)}</b>`,
    "",
  ];

  for (const entry of entries) {
    for (const item of entry.items) {
      lines.push(`<b>${escapeChangelogHtml(item.title)}</b>`);
      lines.push(escapeChangelogHtml(item.description));
      if (item.tip) {
        lines.push(`💡 <i>${escapeChangelogHtml(item.tip)}</i>`);
      }
      lines.push("");
    }
  }

  lines.push("Questions? Send /menu to explore.");

  return lines.join("\n").trim();
}
