import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface JobDescriptionMarkdownProps {
  className?: string;
  description: string;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const getSafeHref = (href?: string) => {
  if (!href) return undefined;

  try {
    const url = new URL(href, "https://job-ops.local");
    if (
      url.origin === "https://job-ops.local" &&
      !href.startsWith("http://") &&
      !href.startsWith("https://") &&
      !href.startsWith("mailto:")
    ) {
      return undefined;
    }

    return SAFE_PROTOCOLS.has(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
};

export const JobDescriptionMarkdown: React.FC<JobDescriptionMarkdownProps> = ({
  className,
  description,
}) => {
  return (
    <div
      className={cn(
        "max-w-none prose dark:prose-invert dark:prose-a:text-primary",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: () => null,
          a: ({ children, href, ...props }) => {
            const safeHref = getSafeHref(href);
            if (!safeHref) return <span>{children}</span>;

            return (
              <a
                {...props}
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {description}
      </ReactMarkdown>
    </div>
  );
};
