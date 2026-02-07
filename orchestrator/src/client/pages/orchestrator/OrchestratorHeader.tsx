import { isNavActive, NAV_LINKS } from "@client/components/navigation";
import type { JobSource } from "@shared/types.js";
import { Loader2, Menu, Play, Sparkles, Square } from "lucide-react";
import type React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  isCancelling: boolean;
  pipelineSources: JobSource[];
  onOpenAutomaticRun: () => void;
  onCancelPipeline: () => void;
}

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  isPipelineRunning,
  isCancelling,
  pipelineSources,
  onOpenAutomaticRun,
  onCancelPipeline,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <Sheet open={navOpen} onOpenChange={onNavOpenChange}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>JobOps</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-2">
                {NAV_LINKS.map(({ to, label, icon: Icon, activePaths }) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => {
                      if (isNavActive(location.pathname, to, activePaths)) {
                        onNavOpenChange(false);
                        return;
                      }
                      onNavOpenChange(false);
                      setTimeout(() => navigate(to), 150);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                      isNavActive(location.pathname, to, activePaths)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                Job Ops
              </div>
              <div className="text-xs text-muted-foreground">Orchestrator</div>
            </div>
          </div>

          {isPipelineRunning && (
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Pipeline running
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPipelineRunning ? (
            <Button
              size="sm"
              onClick={onCancelPipeline}
              disabled={isCancelling}
              variant="destructive"
              className="gap-2"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isCancelling
                  ? `Cancelling (${pipelineSources.length})`
                  : `Cancel run`}
              </span>
            </Button>
          ) : (
            <Button size="sm" onClick={onOpenAutomaticRun} className="gap-2">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Run pipeline</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
