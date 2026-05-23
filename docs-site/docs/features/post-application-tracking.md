---
id: post-application-tracking
title: Post-Application Tracking
description: Gmail and IMAP-based tracking inbox, smart routing, and review workflow.
sidebar_position: 3
---

The Tracking Inbox monitors Gmail and IMAP mailboxes for job-application responses and updates timelines.

![Tracking Inbox review queue](/img/features/tracking-inbox.png)

## Overview

1. Scans Gmail/IMAP for recruitment-related emails
2. Matches emails to tracked jobs using AI
3. Updates timeline/state when confidence is high
4. Queues uncertain matches for manual review

## Smart router flow

```mermaid
flowchart TD
    A[Recruitment email arrives in Gmail] --> B[Smart Router AI analyzes content]
    B --> C{How confident is the match?}

    C -->|95-100%| D[Auto-linked to job]
    D --> E[Timeline updated automatically]

    C -->|50-94%| F[Goes to Inbox for review with suggested match]

    C -->|<50%| G{Is it relevant?}
    G -->|Yes| H[Goes to Inbox as orphan]
    G -->|No| I[Ignored]
```

## Setup

### Prerequisites

1. Gmail account with application emails
2. Google OAuth credentials

### Configure OAuth

Set:

```bash
GMAIL_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_OAUTH_CLIENT_SECRET=your-client-secret
GMAIL_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/gmail/callback
```

Then connect in UI via **Tracking Inbox → Connect Gmail**.

Detailed setup guide:

- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)

### IMAP (any provider)

IMAP works with Gmail, Outlook, Yahoo, iCloud, and any IMAP-compatible email:

1. Open **Tracking Inbox**.
2. Select provider **imap**.
3. Click **Connect IMAP**.
4. Enter your IMAP server settings:
   - Host: e.g., `imap.gmail.com`, `outlook.office365.com`
   - Port: Usually `993` (IMAP over SSL)
   - User: Your email address
   - Password: Your password or app-specific password
   - TLS: Enable (recommended)

Detailed setup guide:

- [IMAP Email Setup](/docs/next/getting-started/imap-setup)

## Using the inbox

## Job emails tab

Open **Job → Emails** to review captured messages already linked to that job.

The tab is read-only. It shows stored metadata only: sender, subject, received
time, snippet, processing status, message type, match confidence, account label,
and a Gmail thread link when the stored message includes a Gmail thread ID.

It does not store full email bodies, re-fetch from Gmail, or expose review
actions. Use **Tracking Inbox** for approve/ignore decisions.

Confidence interpretation:

- `95-100%`: auto-processed
- `50-94%`: pending review with suggestion
- `<50%`: pending review as orphan/ignored

## Privacy and security

- Gmail scope: `https://www.googleapis.com/auth/gmail.readonly`
- IMAP: Direct credential authentication (passwords stored encrypted with AES-256-GCM)
- Minimal metadata sent for matching
- Email data stays local in your instance

## API reference

| Method | Endpoint                                  | Description           |
| ------ | ----------------------------------------- | --------------------- |
| GET    | `/api/post-application/inbox`             | List pending messages |
| POST   | `/api/post-application/inbox/:id/approve` | Approve message       |
| POST   | `/api/post-application/inbox/:id/deny`    | Ignore message        |
| GET    | `/api/post-application/runs`              | List sync runs        |
| GET    | `/api/jobs/:id/emails?limit=100`          | List job-linked email metadata |
| GET    | `/api/post-application/providers/gmail/oauth/start` | Start OAuth flow |
| POST   | `/api/post-application/providers/gmail/oauth/exchange` | Exchange OAuth code |

## Common issues

- No refresh token: disconnect and reconnect Gmail.
- IMAP authentication failed: verify credentials, enable app passwords if 2FA is enabled.
- Emails not appearing: check runs, OAuth/IMAP config, and recruitment subjects.
- Wrong matches: expected in lower-confidence buckets; use manual review.
