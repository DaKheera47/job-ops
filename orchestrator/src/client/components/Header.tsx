/**
 * Header component with logo and pipeline trigger.
 */

import React from "react";
import {
  ChevronDown,
  Loader2,
  Play,
  RefreshCcw,
  Rocket,
  Settings,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JobSource } from "../../shared/types";

interface HeaderProps {
  onRunPipeline: () => void;
  onRefresh: () => void;
  onClearDatabase: () => void;
  isPipelineRunning: boolean;
  isLoading: boolean;
  pipelineSources: JobSource[];
  onPipelineSourcesChange: (sources: JobSource[]) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onRunPipeline,
  onRefresh,
  onClearDatabase,
  isPipelineRunning,
  isLoading,
  pipelineSources,
  onPipelineSourcesChange,
}) => {
  const sourceLabel: Record<JobSource, string> = {
    gradcracker: "Gradcracker",
    indeed: "Indeed",
    linkedin: "LinkedIn",
    ukvisajobs: "UK Visa Jobs",
  };

  const orderedSources: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];

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
        <Link
          to='/'
          className='flex items-center gap-3 hover:opacity-80 transition-opacity'
        >
          <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm'>
            <Rocket className='h-5 w-5' />
          </div>
          <div className='leading-tight'>
            <div className='text-sm font-semibold tracking-tight'>Job Ops</div>
            <div className='text-xs text-muted-foreground'>Orchestrator</div>
          </div>
        </Link>

        <div className='flex flex-wrap items-center gap-1.5'>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                disabled={isLoading}
                title='Clear all jobs from database'
              >
                <Trash2 className='h-4 w-4' />
                <span className='hidden sm:inline'>Clear DB</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all jobs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes all jobs from the database. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onClearDatabase}>
                  Clear database
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant='outline'
            size='sm'
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCcw className='h-4 w-4' />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>

          <Button
            asChild
            variant='outline'
            size='sm'
          >
            <Link to='/settings'>
              <Settings className='h-4 w-4' />
              <span className='hidden sm:inline'>Settings</span>
            </Link>
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
                  >
                    {sourceLabel[source]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onPipelineSourcesChange(orderedSources)}
                >
                  All sources
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onPipelineSourcesChange(["gradcracker"])}
                >
                  Gradcracker only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    onPipelineSourcesChange(["indeed", "linkedin"])
                  }
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
