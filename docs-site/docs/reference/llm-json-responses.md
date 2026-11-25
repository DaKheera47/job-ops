---
id: llm-json-responses
title: Structured AI Responses
description: How JobOps reads structured AI output without changing text inside JSON values.
sidebar_position: 40
---

## What it is

JobOps reads structured AI responses as complete JSON values. A Markdown code fence enclosing the entire response is accepted, with or without the `json` language label.

## Why it exists

Job descriptions and generated text can contain backticks, code examples, and braces. Removing code fences throughout the response changes that content; extracting only the text between the first and last braces can also break valid JSON arrays or strings.

## How to use it

Use your configured AI provider normally. No setting is required. JobOps removes an enclosing response fence and parses the complete JSON value, preserving code fences and backticks inside string values. It can still recover a JSON object surrounded by explanatory prose.

## Common problems

- Malformed JSON still reports a parsing error through the existing retry flow. This handling does not repair arbitrary invalid JSON.
- Reading a complete JSON value does not replace the caller's schema validation. A response still needs to match the structure required by the feature using it.
- If an older version removed code fences from saved content, this fix does not reconstruct that content. Review it or regenerate it with the updated version.

## Related pages

- [Common Problems](/docs/troubleshooting/common-problems)
- [Resume Studio](/docs/features/design-resume)
