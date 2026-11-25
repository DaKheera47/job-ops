---
id: refresh-models
title: Refresh available AI models
description: Reload model suggestions after installing a model or recovering a provider connection.
sidebar_position: 20
---

## What it is

**Refresh models** reloads the available model suggestions in onboarding and Settings for providers that support model discovery, including Ollama.

## Why it exists

An Ollama model installed while JobOps is open does not appear in an already loaded model list. Refreshing also lets you retry a failed discovery request without changing your connection settings or reloading the whole page.

## How to use it

1. Open the AI connection step in onboarding, or the model configuration in Settings.
2. Choose your provider and enter its connection details. For Ollama, install the model first, for example `ollama pull llama3.2`.
3. Click **Refresh models** above **Default model**.
4. Wait for the request to finish, then open the model dropdown and choose a model. You can still enter an exact model name using the dropdown's custom-value option.

Refreshing uses the connection details currently entered in the form and does not save them, change your selected model, or run an AI inference request. Discovery may contact the selected provider, using the same credentials as the initial model lookup. Global default and legacy per-purpose model dropdowns share the refreshed suggestions; provider-specific purpose overrides retain their own discovery behavior.

## Common problems

- **The button is disabled:** wait for the current lookup to finish, finish editing the connection details, or enter a required API key. It is also disabled while the form is busy.
- **The provider is offline:** start it or fix the connection details, then click **Refresh models** again.
- **No models are returned:** check that a model is installed and that JobOps can reach the provider. Enter the model name manually if discovery is unavailable.
- **There is no refresh button:** the selected provider uses manual model entry instead of discovery.

## Related pages

- [Self-hosting](/docs/getting-started/self-hosting)
- [Common problems](/docs/troubleshooting/common-problems)
