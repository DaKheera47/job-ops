import { ExternalLink } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KbdHint } from "./KbdHint";

interface OpenJobListingButtonProps {
  href: string;
  className?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export const OpenJobListingButton: React.FC<OpenJobListingButtonProps> = ({
  href,
  className,
  shortcut,
  disabled = false,
  onClick,
}) => {
  if (disabled) {
    return (
      <Button variant="outline" className={cn("gap-1", className)} disabled>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Open Job Listing</span>
        {shortcut ? <KbdHint shortcut={shortcut} className="ml-auto" /> : null}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" className={cn("gap-1", className)}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Open Job Listing</span>
        {shortcut ? <KbdHint shortcut={shortcut} className="ml-auto" /> : null}
      </a>
    </Button>
  );
};
