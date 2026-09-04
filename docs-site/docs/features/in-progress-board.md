---
id: in-progress-board
title: In Progress Board
description: Post-application kanban board for tracking fewer, higher-attention jobs through interview and offer stages.
sidebar_position: 3
---

## What it is

The In Progress Board is a kanban view for jobs that have moved beyond initial application.

![In Progress Board kanban lanes](/img/features/in-progress-board.png)

It groups jobs into lanes:

- Applied
- Recruiter Screen
- Assessment
- Team Match
- Technical Interview
- Final Round
- Offer
- Closed

The **Applied** lane can be collapsed to a thin strip so it doesn't take up horizontal space, letting you focus on jobs that are actively moving through later stages. Your collapsed/expanded preference is remembered across visits.

## Why it exists

JobOps uses two operational modes:

- **Pre-application tracking** (`Jobs` page): large volume, pipeline and readiness focused.
- **Post-application tracking** (`In Progress Board`): smaller volume, higher attention per job.

Once a job enters the post-application phase, each opportunity usually needs tighter follow-up, interview prep, and deliberate stage management. A kanban board is better for that than a large list.

## How to use it

1. Open **In Progress Board**.
2. Review jobs by lane to see current stage distribution.
3. Drag a card to a new lane to log a stage transition.
4. Open a card to view full job details and timeline.
5. Use sorting (Recent / Title / Company) to prioritize review.

:::tip Celebration Effect
When you successfully move a job listing to the **Offer** stage (either by dragging a card to the **Offer** column or by logging an **Offer** stage event), a congratulatory celebration with confetti and floating balloons will trigger on the screen to celebrate your achievement!
:::

### Moving jobs into post-application

Marking a job **Applied** puts it directly on the board in the Applied lane — there's no separate "move to in progress" step. From there, drag a card (or use the card menu's **Log event**) to record what actually happened: Recruiter Screen, Rejected, Withdrawn, or any other stage/outcome.

Later stage changes can also happen via:

- Tracking Inbox review/automation (recommended)
- Manual stage transitions in job detail/timeline tools

### API examples

```bash
# List in-progress jobs
curl "http://localhost:3001/api/jobs?status=in_progress&view=list"
```

```bash
# Move a job to technical interview
curl -X POST "http://localhost:3001/api/jobs/<jobId>/stage-events" \
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

## Common problems

### Board is empty

- Confirm jobs have status `applied` or `in_progress`.
- Check whether the Applied lane is collapsed — expand it from the chevron in its header.

### A card appears in an unexpected lane

- The board uses the latest stage event as source of truth.
- Check timeline events for out-of-order or mistaken transitions.

### Drag-and-drop move failed

- Network/API error can roll back optimistic UI movement.
- Retry move and check server logs for validation errors.

## Related pages

- [Overview](/docs/next/features/overview)
- [Orchestrator](/docs/next/features/orchestrator)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
