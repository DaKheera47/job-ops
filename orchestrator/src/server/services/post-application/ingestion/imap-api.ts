import { normalizeWhitespace } from "@shared/utils/string";
import { convert } from "html-to-text";
import { ImapFlow, type MailboxLockObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { IngestionTransport } from "./ingestion-core";

export type ImapCredentials = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox?: string;
};

export type ParsedImapMessage = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  body: string;
};

function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: 130,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
  });
}

// Pure: raw RFC822 source -> the shape the shared loop consumes. Kept separate
// from the network client so it can be tested without an IMAP server.
export async function parseImapSource(
  uid: string,
  source: string | Buffer,
): Promise<ParsedImapMessage> {
  const parsed = await simpleParser(source);
  const from = parsed.from?.text?.trim() ?? "";
  const subject = parsed.subject?.trim() ?? "";
  const date = parsed.date ? parsed.date.toUTCString() : "";
  const body = (
    parsed.text ?? (parsed.html ? htmlToText(parsed.html) : "")
  ).trim();
  // Dedup on Message-ID (stable across mailbox moves); fall back to UID.
  const messageId = parsed.messageId?.trim();
  const externalId = messageId && messageId.length > 0 ? messageId : uid;

  return {
    id: externalId,
    threadId: externalId,
    snippet: normalizeWhitespace(body).slice(0, 200),
    from,
    subject,
    date,
    body,
  };
}

export function buildImapTransport(creds: ImapCredentials): IngestionTransport {
  const mailbox = creds.mailbox ?? "INBOX";
  const cache = new Map<string, ParsedImapMessage>();
  let client: ImapFlow | null = null;
  let lock: MailboxLockObject | null = null;

  async function ensureClient(): Promise<ImapFlow> {
    if (client) return client;
    const next = new ImapFlow({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
      logger: false,
    });
    await next.connect();
    lock = await next.getMailboxLock(mailbox);
    client = next;
    return next;
  }

  // getMetadata then getBody both need the message; parse once per UID.
  async function fetchParsed(uid: string): Promise<ParsedImapMessage> {
    const cached = cache.get(uid);
    if (cached) return cached;
    const conn = await ensureClient();
    const message = await conn.fetchOne(uid, { source: true }, { uid: true });
    if (!message || !message.source) {
      throw new Error(`IMAP message '${uid}' not found in '${mailbox}'.`);
    }
    const parsed = await parseImapSource(uid, message.source);
    cache.set(uid, parsed);
    return parsed;
  }

  return {
    async listMessages(searchDays, maxMessages) {
      const conn = await ensureClient();
      // ponytail: IMAP SINCE is date-granular (drops time-of-day), so searchDays
      // is a floor — it can return a few extra hours. Fine for tracking.
      const since = new Date(Date.now() - searchDays * 86_400_000);
      const uids = await conn.search({ since }, { uid: true });
      const list = (uids || [])
        .slice()
        .sort((a, b) => b - a)
        .slice(0, maxMessages);
      return list.map((uid) => ({ id: String(uid), threadId: String(uid) }));
    },
    async getMetadata(id) {
      const parsed = await fetchParsed(id);
      return {
        id: parsed.id,
        threadId: parsed.threadId,
        snippet: parsed.snippet,
        from: parsed.from,
        subject: parsed.subject,
        date: parsed.date,
      };
    },
    async getBody(id) {
      const parsed = await fetchParsed(id);
      return parsed.body;
    },
    async close() {
      cache.clear();
      if (lock) {
        lock.release();
        lock = null;
      }
      if (client) {
        await client.logout().catch(() => {});
        client = null;
      }
    },
  };
}
