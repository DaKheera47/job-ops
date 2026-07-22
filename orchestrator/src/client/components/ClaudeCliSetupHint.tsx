import { ExternalLink } from "lucide-react";
import type React from "react";

const AUTH_DOC = "https://code.claude.com/docs/en/authentication";

/**
 * Explains how to authenticate the Claude Code CLI (subscription token or API
 * key), which JobOps uses when LLM_PROVIDER is `claude_cli`.
 */
export const ClaudeCliSetupHint: React.FC = () => {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Claude CLI on this machine</p>
      <p className="mt-2">
        Install{" "}
        <a
          className="text-foreground underline decoration-border underline-offset-4"
          href="https://www.npmjs.com/package/@anthropic-ai/claude-code"
          target="_blank"
          rel="noopener noreferrer"
        >
          @anthropic-ai/claude-code
        </a>
        , then run{" "}
        <code className="rounded bg-muted px-1 py-0.5">claude setup-token</code>{" "}
        in a terminal (requires a Claude Pro, Max, Team, or Enterprise
        subscription) and set the printed value as{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          CLAUDE_CODE_OAUTH_TOKEN
        </code>
        , or set{" "}
        <code className="rounded bg-muted px-1 py-0.5">ANTHROPIC_API_KEY</code>{" "}
        instead. JobOps spawns the CLI in headless mode and reuses that
        authentication — no JobOps API key field.
      </p>
      <p className="mt-2">
        <a
          className="inline-flex items-center gap-1 text-foreground underline decoration-border underline-offset-4"
          href={AUTH_DOC}
          target="_blank"
          rel="noopener noreferrer"
        >
          Authentication guide
          <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </a>
        . In Docker, set{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          CLAUDE_CODE_OAUTH_TOKEN
        </code>{" "}
        (or{" "}
        <code className="rounded bg-muted px-1 py-0.5">ANTHROPIC_API_KEY</code>)
        in your <code className="rounded bg-muted px-1 py-0.5">.env</code> file
        — no credential file mount is needed. Optional:{" "}
        <code className="rounded bg-muted px-1 py-0.5">CLAUDE_CLI_BIN</code> to
        override the binary path.
      </p>
    </div>
  );
};
