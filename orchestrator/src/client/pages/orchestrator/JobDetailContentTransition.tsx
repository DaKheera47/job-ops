import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface JobDetailContentTransitionProps {
  jobId: string;
  children: ReactNode;
  className?: string;
}

const transition = { duration: 0.15, ease: "easeOut" } as const;

export function JobDetailContentTransition({
  jobId,
  children,
  className,
}: JobDetailContentTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative min-w-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={jobId}
          className={cn(className)}
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 6 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
