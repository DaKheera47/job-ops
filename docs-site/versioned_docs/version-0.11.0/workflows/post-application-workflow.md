---
id: post-application-workflow
title: Post-Application Workflow
description: Track post-application progress manually, or configure automatic Gmail syncing and inbox review.
sidebar_position: 2
---

## Goal

After a job is marked `applied`, use this workflow to track what happens next.

You have two valid paths:

- **Manual tracking**: update stages/events yourself.
- **Automatic Gmail sync**: let email ingestion route events into inbox/review flow.

## Option A: Manual event tracking

Use this when you want explicit, hands-on control for each job.

### Manual flow

1. Open an `applied` or `in_progress` job.
2. Record stage progress as events (screening, interview, offer, closed, etc.).
3. Keep notes/outcomes current as conversations progress.
4. Use In Progress Board for high-attention jobs in later stages.

### API example (manual stage transition)

```bash
curl -X POST "http://localhost:3001/api/jobs/<jobId>/stages" \
  -H "content-type: application/json" \
  -d '{
    "toStage": "technical_interview",
    "metadata": {
      "actor": "user",
      "eventType": "status_update",
      "eventLabel": "Moved to Technical Interview"
    }
  }'
```

## Option B: Automatic Gmail syncing

Use this when you want JobOps to ingest recruitment emails and suggest/apply updates.

### High-level flow

1. Connect Gmail provider.
2. Run sync (or scheduled sync, depending on setup).
3. Smart router scores message-to-job match.
4. High confidence updates are auto-linked.
5. Mid/low confidence items go to inbox for review.

### Configure Gmail sync

Set OAuth variables:

```bash
GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/gmail/callback
```

For exact Google Cloud steps and scope requirements, see:

- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)

Then in app:

1. Open Tracking Inbox / provider controls.
2. Start Gmail OAuth.
3. Complete consent.
4. Trigger sync and review inbox items.

### API examples (Gmail path)

```bash
# Start OAuth
curl "http://localhost:3001/api/post-application/providers/gmail/oauth/start?accountKey=default"
```

```bash
# Exchange authorization code
curl -X POST "http://localhost:3001/api/post-application/providers/gmail/oauth/exchange" \
  -H "content-type: application/json" \
  -d '{"accountKey":"default","state":"<state>","code":"<code>"}'
```

```bash
# Trigger provider sync action
curl -X POST "http://localhost:3001/api/post-application/providers/gmail/actions/sync" \
  -H "content-type: application/json" \
  -d '{"accountKey":"default","maxMessages":100,"searchDays":30}'
```

```bash
# Review inbox
curl "http://localhost:3001/api/post-application/inbox?provider=gmail&accountKey=default"
```

```bash
# Approve inbox item
curl -X POST "http://localhost:3001/api/post-application/inbox/<messageId>/approve" \
  -H "content-type: application/json" \
  -d '{"provider":"gmail","accountKey":"default"}'
```

```bash
# Deny inbox item
curl -X POST "http://localhost:3001/api/post-application/inbox/<messageId>/deny" \
  -H "content-type: application/json" \
  -d '{"provider":"gmail","accountKey":"default"}'
```

## Which option should you use?

- Choose **manual** if your volume is low and you want direct control.
- Choose **automatic Gmail sync** if your volume is higher and you want less repetitive triage.
- Many users combine both: auto-sync first, manual adjustments for edge cases.

## Common problems

### Gmail connected but no messages appear

- Verify OAuth credentials and redirect URI.
- Confirm you are syncing the intended account key.
- Check search window (`searchDays`) and message cap (`maxMessages`).

### Wrong job matched

- Expected in lower-confidence buckets.
- Deny incorrect inbox items and apply manual stage updates where needed.

### I prefer not to grant Gmail access

- Use the manual tracking path only.
- The post-application workflow still works without Gmail integration.

## Related pages

- [Find Jobs and Apply Workflow](./find-jobs-and-apply-workflow)
- [Post-Application Tracking](../features/post-application-tracking)
- [In Progress Board](../features/in-progress-board)
- [Overview](../features/overview)
