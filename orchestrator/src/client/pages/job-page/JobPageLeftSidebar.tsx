import type { Job } from "@shared/types.js";
import {
  ClipboardList,
  FileText,
  FolderKanban,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";

export type JobMemoryView =
  | "overview"
  | "note"
  | "documents"
  | "timeline"
  | "ghostwriter";

type JobPageLeftSidebarProps = {
  job: Job;
  activeMemoryView: JobMemoryView;
  baseJobPath: string;
  selectedProjects: string[];
  sourceLabel: string;
};

const memoryLinks = [
  {
    id: "overview" as const,
    label: "Overview",
    icon: FolderKanban,
  },
  {
    id: "note" as const,
    label: "Notes",
    icon: MessageSquareText,
  },
  {
    id: "documents" as const,
    label: "Documents",
    icon: FileText,
  },
  {
    id: "timeline" as const,
    label: "Timeline",
    icon: ClipboardList,
  },
  {
    id: "ghostwriter" as const,
    label: "Ghostwriter",
    icon: Sparkles,
  },
];

export const JobPageLeftSidebar: React.FC<JobPageLeftSidebarProps> = ({
  job,
  activeMemoryView,
  baseJobPath,
  selectedProjects,
  sourceLabel,
}) => (
  <aside className="space-y-4 xl:sticky xl:top-5">
    <section className="rounded-xl border border-border/50 bg-card/85 p-4">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Application dossier
        </div>
        <h1 className="text-2xl font-semibold leading-tight">{job.employer}</h1>
        <div className="text-sm text-muted-foreground">{job.title}</div>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Source</span>
          <span className="text-right font-medium">{sourceLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Location</span>
          <span className="text-right font-medium">
            {job.location || "Unknown"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Found</span>
          <span className="text-right font-medium">
            {formatDateTime(job.discoveredAt) ?? job.discoveredAt}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Applied</span>
          <span className="text-right font-medium">
            {job.appliedAt
              ? (formatDateTime(job.appliedAt) ?? job.appliedAt)
              : "Not marked"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Outcome</span>
          <span className="text-right font-medium">
            {job.outcome ? job.outcome.replace(/_/g, " ") : "Open"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3">
          <span className="text-muted-foreground">Projects Chosen</span>
          <span className="text-right font-medium">
            {selectedProjects.length > 0
              ? selectedProjects.length
              : "No projects"}
          </span>
        </div>
      </div>
    </section>

    <section className="rounded-xl border border-border/50 bg-card/70 p-3">
      <div className="mb-2 px-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Links
      </div>
      <div className="space-y-1">
        {memoryLinks.map(({ id: linkView, label, icon: Icon }) => {
          const path =
            linkView === "overview"
              ? baseJobPath
              : `${baseJobPath}/${linkView}`;
          return (
            <Button
              asChild
              key={linkView}
              variant={activeMemoryView === linkView ? "outline" : "ghost"}
              className={cn(
                "h-9 w-full justify-between px-2 text-left text-sm",
              )}
            >
              <Link to={path}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </section>
  </aside>
);
