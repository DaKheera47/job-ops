import React from "react";
import {
  Briefcase,
  ChevronDown,
  FileText,
  Home,
  Loader2,
  Menu,
  Play,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { sourceLabel } from "@/lib/utils";
import type { JobSource } from "../../../shared/types";
import { orderedSources } from "./constants";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  pipelineSources: JobSource[];
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  onRunPipeline: () => void;
  onOpenManualImport: () => void;
}

const navLinks = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
  { to: "/ukvisajobs", label: "UK Visa Jobs", icon: Briefcase },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  isPipelineRunning,
  pipelineSources,
  onToggleSource,
  onSetPipelineSources,
  onRunPipeline,
  onOpenManualImport,
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
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => {
                      if (location.pathname === to) {
                        onNavOpenChange(false);
                        return;
                      }
                      onNavOpenChange(false);
                      setTimeout(() => navigate(to), 150);
                    }}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left ${
                      location.pathname === to || (to === "/" && ["/ready", "/discovered", "/applied", "/all"].includes(location.pathname))
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
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
              <div className="text-sm font-semibold tracking-tight">Job Ops</div>
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
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenManualImport}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Manual import</span>
          </Button>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={onRunPipeline}
              disabled={isPipelineRunning}
              className="gap-2"
            >
              {isPipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span className="hidden sm:inline">{isPipelineRunning ? "Running" : "Run pipeline"}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={isPipelineRunning}
                  aria-label="Select pipeline sources"
                  className="shrink-0"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Sources</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {orderedSources.map((source) => (
                  <DropdownMenuCheckboxItem
                    key={source}
                    checked={pipelineSources.includes(source)}
                    onCheckedChange={(checked) => onToggleSource(source, Boolean(checked))}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {sourceLabel[source]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onSetPipelineSources(orderedSources);
                  }}
                >
                  All sources
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onSetPipelineSources(["gradcracker"]);
                  }}
                >
                  Gradcracker only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onSetPipelineSources(["indeed", "linkedin"]);
                  }}
                >
                  Indeed + LinkedIn only
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};
