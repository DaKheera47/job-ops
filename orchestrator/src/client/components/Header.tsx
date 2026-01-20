/**
 * Header component with logo and pipeline trigger.
 */

import React from "react";
import {
  Briefcase,
  ChevronDown,
  Home,
  Loader2,
  Menu,
  Play,
  RefreshCcw,
  Settings,
  Shield,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

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
import type { JobSource } from "../../shared/types";

interface HeaderProps {
  onRunPipeline: () => void;
  onRefresh: () => void;
  isPipelineRunning: boolean;
  isLoading: boolean;
  pipelineSources: JobSource[];
  onPipelineSourcesChange: (sources: JobSource[]) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onRunPipeline,
  onRefresh,
  isPipelineRunning,
  isLoading,
  pipelineSources,
  onPipelineSourcesChange,
}) => {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const orderedSources: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];

  const navLinks = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
    { to: "/ukvisajobs", label: "UK Visa Jobs", icon: Briefcase },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  const toggleSource = (source: JobSource, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...pipelineSources, source]))
      : pipelineSources.filter((s) => s !== source);

    if (next.length === 0) return;
    onPipelineSourcesChange(next);
  };

  return (
    <header className='sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4'>
        <div className='flex items-center gap-3'>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant='ghost' size='icon'>
                <Menu className='h-5 w-5' />
                <span className='sr-only'>Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side='left' className='w-64'>
              <SheetHeader>
                <SheetTitle>
                  JobOps
                </SheetTitle>
              </SheetHeader>
              <nav className='mt-6 flex flex-col gap-2'>
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setSheetOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                      location.pathname === to
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon className='h-4 w-4' />
                    {label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Link
            to='/'
            className='flex items-center gap-3 hover:opacity-80 transition-opacity'
          >
            <div className='flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-transparent shadow-sm'>
              <img
                src='/favicon.png'
                alt='Job Ops Logo'
                className='h-full w-full object-contain'
              />
            </div>
            <div className='leading-tight'>
              <div className='text-sm font-semibold tracking-tight'>Job Ops</div>
              <div className='text-xs text-muted-foreground'>Orchestrator</div>
            </div>
          </Link>
        </div>

        <div className='flex flex-wrap items-center gap-1.5'>
          <Button
            variant='outline'
            size='sm'
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCcw className='h-4 w-4' />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>

          <div>
            <Button
              size='sm'
              onClick={onRunPipeline}
              disabled={isPipelineRunning}
              className='rounded-r-none'
            >
              {isPipelineRunning ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Running...
                </>
              ) : (
                <>
                  <Play className='h-4 w-4' />
                  Run Pipeline
                </>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='sm'
                  disabled={isPipelineRunning}
                  className='rounded-l-none border-l border-primary-foreground/20'
                  aria-label='Select pipeline sources'
                >
                  <ChevronDown className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align='end'
                className='w-56'
              >
                <DropdownMenuLabel>Sources</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {orderedSources.map((source) => (
                  <DropdownMenuCheckboxItem
                    key={source}
                    checked={pipelineSources.includes(source)}
                    onCheckedChange={(checked) =>
                      toggleSource(source, Boolean(checked))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    {sourceLabel[source]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    onPipelineSourcesChange(orderedSources);
                  }}
                >
                  All sources
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    onPipelineSourcesChange(["gradcracker"]);
                  }}
                >
                  Gradcracker only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    onPipelineSourcesChange(["indeed", "linkedin"]);
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
