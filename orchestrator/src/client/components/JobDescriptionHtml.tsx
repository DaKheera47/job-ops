import type React from "react";
import { cn } from "@/lib/utils";

interface JobDescriptionHtmlProps {
  className?: string;
  description: string;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
]);
const ALLOWED_TAGS = new Set([
  "a",
  "article",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "section",
  "span",
  "strong",
  "u",
  "ul",
]);

function getSafeHref(href?: string | null): string | null {
  if (!href) return null;

  try {
    const url = new URL(href, "https://job-ops.local");
    if (
      url.origin === "https://job-ops.local" &&
      !href.startsWith("http://") &&
      !href.startsWith("https://") &&
      !href.startsWith("mailto:")
    ) {
      return null;
    }

    return SAFE_PROTOCOLS.has(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function sanitizeJobDescriptionHtml(html: string): string {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const container = output.createElement("div");

  function appendSanitizedChildren(
    source: Node,
    target: HTMLElement | DocumentFragment,
  ) {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(output.createTextNode(child.textContent ?? ""));
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const element = child as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      if (BLOCKED_TAGS.has(tagName)) {
        continue;
      }

      if (!ALLOWED_TAGS.has(tagName)) {
        appendSanitizedChildren(element, target);
        continue;
      }

      const cleanElement = output.createElement(tagName);
      if (tagName === "a") {
        const safeHref = getSafeHref(element.getAttribute("href"));
        if (safeHref) {
          cleanElement.setAttribute("href", safeHref);
          cleanElement.setAttribute("target", "_blank");
          cleanElement.setAttribute("rel", "noopener noreferrer nofollow");
        }
      }

      appendSanitizedChildren(element, cleanElement);
      target.appendChild(cleanElement);
    }
  }

  appendSanitizedChildren(parsed.body, container);
  return container.innerHTML;
}

export const JobDescriptionHtml: React.FC<JobDescriptionHtmlProps> = ({
  className,
  description,
}) => {
  const sanitizedHtml = sanitizeJobDescriptionHtml(description);

  return (
    <div
      className={cn(
        "max-w-none prose dark:prose-invert dark:prose-a:text-primary",
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized through a strict allowlist before rendering.
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};
