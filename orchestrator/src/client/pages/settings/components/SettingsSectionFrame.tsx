import type React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type SettingsSectionFrameProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  mode?: "accordion" | "panel";
  title: React.ReactNode;
  tone?: "default" | "danger";
  value: string;
};

export const SettingsSectionFrame: React.FC<SettingsSectionFrameProps> = ({
  children,
  className,
  contentClassName,
  mode = "accordion",
  title,
  tone = "default",
  value,
}) => {
  if (mode === "panel") {
    return (
      <section
        className={cn("space-y-4", tone === "danger" && "pt-2", className)}
      >
        <div className={cn("space-y-4", contentClassName)}>{children}</div>
      </section>
    );
  }

  return (
    <AccordionItem
      value={value}
      className={cn(
        "rounded-lg border px-4",
        tone === "danger" && "mt-4 border-destructive/30",
        className,
      )}
    >
      <AccordionTrigger className="py-4 hover:no-underline">
        {typeof title === "string" ? (
          <span
            className={cn(
              "text-base font-semibold",
              tone === "danger" && "tracking-wider text-destructive",
            )}
          >
            {title}
          </span>
        ) : (
          title
        )}
      </AccordionTrigger>
      <AccordionContent className={cn("pb-4", contentClassName)}>
        {children}
      </AccordionContent>
    </AccordionItem>
  );
};
