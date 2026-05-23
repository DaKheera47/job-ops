---
id: imap-setup
title: IMAP Email Setup
description: Connect any IMAP-compatible email provider (Gmail, Outlook, Yahoo, etc.) to JobOps Tracking Inbox without OAuth.
sidebar_position: 4
---

## What it is

This guide shows how to connect IMAP-compatible email accounts (Gmail, Outlook, Yahoo, iCloud, etc.) to JobOps Tracking Inbox using standard IMAP credentials.

## Why it exists

IMAP support provides a simpler alternative to OAuth when:

- You don't want to set up OAuth apps in Google Cloud or Azure
- Your email provider doesn't support OAuth (custom domains, legacy systems)
- You prefer direct credential-based authentication
- You need to quickly test with multiple email accounts

## How to use it

### 1) Enable IMAP in your email provider

Most modern email providers support IMAP. Ensure IMAP access is enabled:

**Gmail:**
- Go to Settings → Forwarding and POP/IMAP
- Enable IMAP
- If 2FA is enabled, create an App Password instead of using your main password

**Outlook/Office 365:**
- IMAP is enabled by default
- Use your regular email and password
- If 2FA is enabled, you may need an app password

**Yahoo Mail:**
- Go to Account Security → Generate app password
- Use the generated password instead of your main password

**iCloud:**
- Go to Apple ID → Security → App-Specific Passwords
- Generate a new password for JobOps

**Other providers:**
- Check your provider's documentation for IMAP settings
- Common port: 993 (IMAP over SSL/TLS)

### 2) Find your IMAP server settings

Common IMAP server configurations:

| Provider | IMAP Server | Port | TLS |
|----------|-------------|------|-----|
| Gmail | `imap.gmail.com` | 993 | Yes |
| Outlook/O365 | `outlook.office365.com` | 993 | Yes |
| Yahoo | `imap.mail.yahoo.com` | 993 | Yes |
| iCloud | `imap.mail.me.com` | 993 | Yes |
| Fastmail | `imap.fastmail.com` | 993 | Yes |
| ProtonMail Bridge | `127.0.0.1` | 1143 | No |

For other providers, check their support documentation or email client setup guides.

### 3) Connect IMAP in JobOps

1. Open **Tracking Inbox** in JobOps.
2. Select provider **imap** from the dropdown.
3. Enter an account key (default: `default`, or use a custom identifier).
4. Click **Connect IMAP**.
5. Fill in the connection form:
   - **Host**: Your IMAP server address (e.g., `imap.gmail.com`)
   - **Port**: IMAP port (usually `993`)
   - **User**: Your full email address
   - **Password**: Your email password or app-specific password
   - **TLS**: Enable for secure connection (recommended, default: enabled)
   - **Display Name**: Optional friendly name for this account

6. Click **Submit** to test and save the connection.

### 4) Run a sync

After connecting:

1. Set sync parameters:
   - **Search Days**: How many days back to search (default: 90)
   - **Max Messages**: Maximum messages to process per sync (default: 100)
2. Click **Sync** to scan for recruitment emails.
3. Review discovered messages in the Tracking Inbox.

## Security considerations

### Password storage

- IMAP credentials (including passwords) are stored encrypted in the JobOps database
- Passwords are never logged or exposed in API responses
- Use app-specific passwords when available (Gmail, Yahoo, iCloud)

### Connection security

- Always use TLS/SSL (port 993) when possible
- JobOps rejects unverified certificates by default for maximum compatibility
- For self-hosted mail servers with self-signed certificates, ensure your server has a valid certificate

### Multi-account support

- You can connect multiple IMAP accounts using different account keys
- Each account is isolated and syncs independently
- Use descriptive account keys: `personal`, `work`, `gmail-john`, etc.

## Common problems

### Authentication failed

- **Symptom**: "IMAP connection error: authentication failed"
- **Fix**:
  - Verify email and password are correct
  - Use an app-specific password if 2FA is enabled
  - Ensure IMAP is enabled in your email provider settings
  - Check if your provider blocks "less secure apps" (enable app passwords instead)

### Connection timeout

- **Symptom**: "IMAP connection timed out"
- **Fix**:
  - Verify the host and port are correct
  - Check your network/firewall allows outbound connections to the IMAP server
  - Try increasing the timeout by contacting support

### Wrong IMAP settings

- **Symptom**: Connection fails with "host not found" or similar
- **Fix**:
  - Double-check your email provider's IMAP server address
  - Ensure you're using the IMAP server (not SMTP or POP3)
  - Verify the port (usually 993 for secure IMAP)

### No messages found

- **Symptom**: Sync completes but shows 0 discovered messages
- **Fix**:
  - Increase the search days parameter
  - Check your INBOX has recruitment-related emails
  - IMAP search is keyword-based; not all messages may match

### ProtonMail / Bridge setup

ProtonMail requires the ProtonMail Bridge application:

1. Install ProtonMail Bridge on your server
2. Start the bridge and authenticate
3. Use bridge settings:
   - Host: `127.0.0.1`
   - Port: `1143` (or bridge's configured port)
   - TLS: Disabled (bridge handles encryption)
   - User: Your ProtonMail address
   - Password: Bridge-generated password (not your main password)

## Comparison with OAuth providers

| Feature | IMAP | Gmail OAuth | O365 OAuth |
|---------|------|-------------|------------|
| Setup complexity | Low | Medium | Medium |
| Requires cloud setup | No | Yes | Yes |
| Password in database | Yes (encrypted) | No (uses tokens) | No (uses tokens) |
| Works with any provider | Yes (if IMAP supported) | Gmail only | O365 only |
| Token refresh | N/A | Automatic | Automatic |
| Revocation | Manual disconnect | OAuth revoke | OAuth revoke |

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)
- [O365 OAuth Setup](/docs/next/getting-started/o365-oauth-setup)
- [Post-Application Workflow](/docs/next/workflows/post-application-workflow)
- [Common Problems](/docs/next/troubleshooting/common-problems)
