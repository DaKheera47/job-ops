import { describe, expect, it } from "vitest";
import { parseImapSource } from "./imap-api";

const RAW = [
  "From: Jane Recruiter <jane@careers.acme.example>",
  "To: me@example.com",
  "Subject: Interview invitation",
  "Date: Wed, 17 Sep 2026 10:00:00 +0000",
  "Message-ID: <abc123@acme.example>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "We'd like to invite you to interview next week.",
  "",
].join("\r\n");

describe("parseImapSource", () => {
  it("maps raw RFC822 to the shared loop shape", async () => {
    const parsed = await parseImapSource("42", RAW);
    expect(parsed.id).toBe("<abc123@acme.example>");
    expect(parsed.threadId).toBe("<abc123@acme.example>");
    expect(parsed.from).toContain("jane@careers.acme.example");
    expect(parsed.subject).toBe("Interview invitation");
    expect(parsed.date).toContain("2026");
    expect(parsed.body).toContain("invite you to interview");
    expect(parsed.snippet.length).toBeGreaterThan(0);
  });

  it("falls back to the UID when no Message-ID is present", async () => {
    const noId = RAW.split("\r\n")
      .filter((line) => !line.startsWith("Message-ID:"))
      .join("\r\n");
    const parsed = await parseImapSource("99", noId);
    expect(parsed.id).toBe("99");
  });
});
