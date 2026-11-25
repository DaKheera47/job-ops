---
id: interface-language
title: Interface Language
description: Switch the local JobOps interface between English and Simplified Chinese.
sidebar_position: 30
---

## What it is

The header language selector switches between English and Simplified Chinese.
This adds Chinese labels for setup, navigation, common job
controls, manual import and core settings. Untranslated details fall back to English.

## Why it exists

Chinese-speaking users can configure and use the main workflows without browser
translation. Language selection does not change job records, resume content,
provider identifiers or model names.

## How to use it

Select **简体中文** in the header. Choose **English** to switch back. The setting
is stored in this browser using `jobops.uiLanguage`, and changing it preserves
form state. It is not a tenant-wide preference and does not change AI output language.

## Common problems

Some detailed integration descriptions and external errors may remain in English.
Browser storage restrictions can prevent the preference from persisting after a
reload. English remains available if a translation is missing.

## Related pages

- [Settings](/docs/features/settings)
- [Manual import](/docs/extractors/manual)
