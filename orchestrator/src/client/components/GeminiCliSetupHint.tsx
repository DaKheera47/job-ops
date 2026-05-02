import { ExternalLink } from "lucide-react";
import type React from "react";

const AUTH_DOC =
  "https://google-gemini.github.io/gemini-cli/docs/get-started/authentication.html";

/**
 * Explains how to authenticate the Google Gemini CLI (OAuth or API key via CLI),
 * which JobOps uses when LLM_PROVIDER is `gemini_cli`.
 */
export const GeminiCliSetupHint: React.FC = () => {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Gemini CLI on this machine</p>
      <p className="mt-2">
        Install{" "}
        <a
          className="text-foreground underline decoration-border underline-offset-4"
          href="https://www.npmjs.com/package/@google/gemini-cli"
          target="_blank"
          rel="noopener noreferrer"
        >
          @google/gemini-cli
        </a>
        , then run <code className="rounded bg-muted px-1 py-0.5">gemini</code>{" "}
        in a terminal and complete Google sign-in (OAuth), or set{" "}
        <code className="rounded bg-muted px-1 py-0.5">GEMINI_API_KEY</code> for
        the CLI. JobOps spawns the CLI in headless mode and reuses those
        credentials — no JobOps API key field.
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
        . In Docker, mount your CLI config (for example{" "}
        <code className="rounded bg-muted px-1 py-0.5">~/.gemini</code>) into
        the container or run{" "}
        <code className="rounded bg-muted px-1 py-0.5">gemini</code> via{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          docker compose exec
        </code>
        . Optional:{" "}
        <code className="rounded bg-muted px-1 py-0.5">GEMINI_CLI_BIN</code> to
        override the binary path;{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          GEMINI_CLI_TRUST_WORKSPACE=true
        </code>{" "}
        to omit{" "}
        <code className="rounded bg-muted px-1 py-0.5">--skip-trust</code>.
      </p>
    </div>
  );
};
