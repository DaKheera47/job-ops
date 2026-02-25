/**
 * Shared layout components for consistent page structure.
 */

import { ExternalLink, type LucideIcon, Menu } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useVersionCheck } from "../hooks/useVersionCheck";
import { isNavActive, NAV_LINKS } from "./navigation";
import { StatusBadgeIndicator } from "./StatusIndicator";

// ============================================================================
// Page Header
// ============================================================================

interface PageHeaderProps {
  icon: LucideIcon | React.FC<{ className?: string }>;
  title: string;
  subtitle: string;
  badge?: string;
  statusIndicator?: React.ReactNode;
  actions?: React.ReactNode;
  showVersionFooter?: boolean;
  navOpen?: boolean;
  onNavOpenChange?: (open: boolean) => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  badge,
  statusIndicator,
  actions,
  showVersionFooter = true,
  navOpen: controlledNavOpen,
  onNavOpenChange,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [internalNavOpen, setInternalNavOpen] = useState(false);
  const navOpen = controlledNavOpen ?? internalNavOpen;
  const setNavOpen = onNavOpenChange ?? setInternalNavOpen;
  const { version, updateAvailable } = useVersionCheck();

  const handleNavClick = (to: string, activePaths?: string[]) => {
    if (isNavActive(location.pathname, to, activePaths)) {
      setNavOpen(false);
      return;
    }
    setNavOpen(false);
    setTimeout(() => navigate(to), 150);
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 flex flex-col">
              <SheetHeader>
                <SheetTitle>JobOps</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-2">
                {NAV_LINKS.map(({ to, label, icon: NavIcon, activePaths }) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => handleNavClick(to, activePaths)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                      isNavActive(location.pathname, to, activePaths)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <NavIcon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </nav>
              {showVersionFooter && (
                <div className="mt-auto pt-6 pb-2">
                  <TooltipProvider>
                    <div className="flex flex-col items-start gap-2">
                      <a
                        href="https://github.com/DaKheera47/job-ops/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span className="truncate">Version {version}</span>
                        {updateAvailable && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="h-2 w-2 shrink-0 cursor-pointer rounded-full bg-emerald-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Update available</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNavOpen(false);
                          window.open("/docs", "_blank", "noopener,noreferrer");
                        }}
                        className="h-7 gap-1.5 px-2 text-xs"
                      >
                        <span>Documentation</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TooltipProvider>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          {badge && (
            <Badge variant="outline" className="uppercase tracking-wide">
              {badge}
            </Badge>
          )}
          {statusIndicator}
        </div>

        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
};

export const StatusIndicator = StatusBadgeIndicator;

// ============================================================================
// Split Layout (List + Detail panels)
// ============================================================================

interface SplitLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const SplitLayout: React.FC<SplitLayoutProps> = ({
  children,
  className,
}) => (
  <section
    className={cn(
      "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]",
      className,
    )}
  >
    {children}
  </section>
);

// ============================================================================
// List Panel (left side of split)
// ============================================================================

interface ListPanelProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const ListPanel: React.FC<ListPanelProps> = ({
  children,
  header,
  footer,
  className,
}) => (
  <div
    className={cn(
      "min-w-0 rounded-xl border border-border/60 bg-card/40 flex flex-col",
      className,
    )}
  >
    {header && (
      <div className="border-b border-border/60 px-4 py-3">{header}</div>
    )}
    <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
      {children}
    </div>
    {footer && (
      <div className="border-t border-border/60 px-4 py-2">{footer}</div>
    )}
  </div>
);

// ============================================================================
// List Item (clickable row in list)
// ============================================================================

interface ListItemProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const ListItem: React.FC<ListItemProps> = ({
  selected,
  onClick,
  children,
  className,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors",
      selected ? "bg-muted/40" : "hover:bg-muted/30",
      className,
    )}
    aria-pressed={selected}
  >
    {children}
  </button>
);

// ============================================================================
// Detail Panel (right side of split)
// ============================================================================

interface DetailPanelProps {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  children,
  className,
  sticky = true,
}) => (
  <div
    className={cn(
      "min-w-0 rounded-xl border border-border/60 bg-card/40 p-4",
      sticky && "lg:sticky lg:top-24 lg:self-start",
      className,
    )}
  >
    {children}
  </div>
);

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    {Icon && <Icon className="h-10 w-10 text-muted-foreground/50 mb-2" />}
    <div className="text-base font-semibold">{title}</div>
    {description && (
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

// ============================================================================
// Score Meter
// ============================================================================

interface ScoreMeterProps {
  score: number | null;
  showLabel?: boolean;
}

const getScoreTokens = (score: number) => {
  if (score >= 90) return { bar: "bg-emerald-500/80" };
  if (score >= 70) return { bar: "bg-amber-500/80" };
  if (score >= 50) return { bar: "bg-orange-500/80" };
  return { bar: "bg-rose-500/80" };
};

export const ScoreMeter: React.FC<ScoreMeterProps> = ({
  score,
  showLabel = true,
}) => {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }

  const tokens = getScoreTokens(score);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-12 rounded-full bg-muted/40">
        <div
          className={cn("h-1.5 rounded-full", tokens.bar)}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
      {showLabel && (
        <span className="tabular-nums text-foreground">{score}%</span>
      )}
    </div>
  );
};

// ============================================================================
// Full Height Split Layout (for pages like VisaSponsors that use full viewport)
// ============================================================================

interface FullHeightSplitProps {
  sidebar: React.ReactNode;
  sidebarWidth?: string;
  children: React.ReactNode;
}

export const FullHeightSplit: React.FC<FullHeightSplitProps> = ({
  sidebar,
  sidebarWidth = "lg:w-[420px]",
  children,
}) => (
  <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
    <div
      className={cn(
        "flex w-full flex-col border-b lg:border-b-0 lg:border-r",
        sidebarWidth,
      )}
    >
      {sidebar}
    </div>
    <div className="flex-1 overflow-y-auto">{children}</div>
  </div>
);

// ============================================================================
// Section Card (for forms, stats, etc.)
// ============================================================================

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  children,
  className,
}) => (
  <section
    className={cn(
      "rounded-xl border border-border/60 bg-card/40 p-4",
      className,
    )}
  >
    {children}
  </section>
);

// ============================================================================
// Page Main Content Wrapper
// ============================================================================

interface PageMainProps {
  children: React.ReactNode;
  className?: string;
}

export const PageMain: React.FC<PageMainProps> = ({ children, className }) => (
  <main
    className={cn(
      "container mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12",
      className,
    )}
  >
    {children}
  </main>
);
