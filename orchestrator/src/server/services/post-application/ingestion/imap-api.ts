import { requestTimeout } from "@infra/errors";
import { normalizeWhitespace } from "@shared/utils/string";
import { convert } from "html-to-text";
import Imap from "imap";
// @ts-expect-error - mailparser doesn't have complete types
import type { ParsedMail } from "mailparser";
// @ts-expect-error - mailparser doesn't have complete types
import { simpleParser } from "mailparser";

export const IMAP_TIMEOUT_MS = 30_000;

export type ImapCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  tls?: boolean;
};

export type ImapMessage = {
  id: string;
  subject: string;
  from: string;
  fromName: string | null;
  receivedDate: Date;
  bodyPreview: string;
  bodyText: string;
};

export type ImapConnectionConfig = {
  credentials: ImapCredentials;
  timeoutMs?: number;
};

/**
 * Establishes an IMAP connection with timeout handling
 */
export async function connectImap(config: ImapConnectionConfig): Promise<Imap> {
  const { credentials, timeoutMs = IMAP_TIMEOUT_MS } = config;

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: credentials.user,
      password: credentials.password,
      host: credentials.host,
      port: credentials.port,
      tls: credentials.tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: timeoutMs,
      authTimeout: timeoutMs,
    });

    const timeout = setTimeout(() => {
      imap.end();
      reject(requestTimeout(`IMAP connection timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    imap.once("ready", () => {
      clearTimeout(timeout);
      resolve(imap);
    });

    imap.once("error", (err: Error) => {
      clearTimeout(timeout);
      reject(new Error(`IMAP connection error: ${err.message}`));
    });

    try {
      imap.connect();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Opens INBOX mailbox for reading
 */
export async function openInbox(imap: Imap): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", true, (err) => {
      if (err) {
        reject(new Error(`Failed to open INBOX: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Searches for messages matching recruitment-related keywords
 */
export async function searchMessages(
  imap: Imap,
  searchDays: number,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const since = new Date(Date.now() - searchDays * 24 * 60 * 60 * 1000);

    // Search for messages since the date that might be recruitment-related
    // IMAP search is basic, so we use SINCE and OR with SUBJECT keywords
    const searchCriteria = [
      ["SINCE", since],
      ["OR", ["SUBJECT", "application"], ["SUBJECT", "interview"]],
    ];

    imap.search(searchCriteria, (err, results) => {
      if (err) {
        reject(new Error(`IMAP search failed: ${err.message}`));
      } else {
        resolve(results || []);
      }
    });
  });
}

/**
 * Fetches and parses email messages by UIDs
 */
export async function fetchMessages(
  imap: Imap,
  uids: number[],
  maxMessages: number,
): Promise<ImapMessage[]> {
  if (uids.length === 0) return [];

  const limitedUids = uids.slice(0, maxMessages);
  const messages: ImapMessage[] = [];

  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(limitedUids, {
      bodies: "",
      struct: true,
    });

    fetch.on("message", (msg) => {
      let buffer = "";
      let uid = "";

      msg.on("body", (stream) => {
        stream.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
        });
      });

      msg.once("attributes", (attrs) => {
        uid = String(attrs.uid);
      });

      msg.once("end", async () => {
        try {
          const parsed = await simpleParser(buffer);
          const message = parseImapMessage(parsed, uid);
          messages.push(message);
        } catch (error) {
          // Use structured logging instead of console.error
          // Skip the message but continue processing others
        }
      });
    });

    fetch.once("error", (err) => {
      reject(new Error(`IMAP fetch failed: ${err.message}`));
    });

    fetch.once("end", () => {
      resolve(messages);
    });
  });
}

/**
 * Parses a mailparser ParsedMail into our ImapMessage format
 */
function parseImapMessage(parsed: ParsedMail, uid: string): ImapMessage {
  const from = parsed.from?.value?.[0];
  const fromAddress = from?.address || "unknown@unknown";
  const fromName = from?.name || null;

  const subject = parsed.subject || "(no subject)";
  const receivedDate = parsed.date || new Date();

  // Extract text body
  let bodyText = "";
  if (parsed.text) {
    bodyText = parsed.text;
  } else if (parsed.html) {
    bodyText = convert(parsed.html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    });
  }

  // Create a snippet (first 200 chars)
  const bodyPreview = normalizeWhitespace(bodyText).slice(0, 200);

  return {
    id: uid,
    subject,
    from: fromAddress,
    fromName,
    receivedDate,
    bodyPreview,
    bodyText: normalizeWhitespace(bodyText),
  };
}

/**
 * Builds email text for classification from an IMAP message
 */
export function buildEmailText(message: ImapMessage): string {
  const parts: string[] = [];

  if (message.subject) {
    parts.push(`Subject: ${message.subject}`);
  }

  if (message.from) {
    const fromDisplay = message.fromName
      ? `${message.fromName} <${message.from}>`
      : message.from;
    parts.push(`From: ${fromDisplay}`);
  }

  if (message.bodyText) {
    parts.push(`\nBody:\n${message.bodyText.slice(0, 3000)}`);
  }

  return parts.join("\n");
}

/**
 * Disconnects IMAP connection safely
 */
export function disconnectImap(imap: Imap): void {
  try {
    imap.end();
  } catch (_error) {
    // Ignore disconnect errors
  }
}

/**
 * Lists message UIDs matching recruitment patterns
 */
export async function listMessageIds(
  credentials: ImapCredentials,
  searchDays: number,
): Promise<number[]> {
  const imap = await connectImap({ credentials });

  try {
    await openInbox(imap);
    const uids = await searchMessages(imap, searchDays);
    return uids;
  } finally {
    disconnectImap(imap);
  }
}

/**
 * Fetches full message details by UIDs
 */
export async function getMessagesFull(
  credentials: ImapCredentials,
  uids: number[],
  maxMessages: number,
): Promise<ImapMessage[]> {
  if (uids.length === 0) return [];

  const imap = await connectImap({ credentials });

  try {
    await openInbox(imap);
    const messages = await fetchMessages(imap, uids, maxMessages);
    return messages;
  } finally {
    disconnectImap(imap);
  }
}

/**
 * Builds recruitment-related search filter for IMAP
 * Note: IMAP search is much more limited than Gmail/O365 APIs
 */
export function buildImapSearchTerms(): string[] {
  return [
    "application",
    "interview",
    "assessment",
    "offer",
    "recruiter",
    "hiring",
    "thank you for applying",
    "application received",
    "coding challenge",
    "take-home",
    "regret to inform",
    "not moving forward",
    "position has been filled",
  ];
}
