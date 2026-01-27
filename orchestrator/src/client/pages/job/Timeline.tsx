import {
  CheckCircle2,
  ClipboardList,
  Edit2,
  FileText,
  MailCheck,
  PhoneCall,
  Presentation,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, formatTimestamp, formatTimestampWithTime } from "@/lib/utils";
import {
  type ApplicationStage,
  STAGE_LABELS,
  type StageEvent,
} from "../../../shared/types";
import { CollapsibleSection } from "../../components/discovered-panel/CollapsibleSection";

const stageIcons: Record<ApplicationStage, React.ReactNode> = {
  applied: <CheckCircle2 className="h-4 w-4" />,
  recruiter_screen: <PhoneCall className="h-4 w-4" />,
  assessment: <FileText className="h-4 w-4" />,
  hiring_manager_screen: <UserRound className="h-4 w-4" />,
  technical_interview: <Video className="h-4 w-4" />,
  onsite: <Presentation className="h-4 w-4" />,
  offer: <MailCheck className="h-4 w-4" />,
  closed: <ClipboardList className="h-4 w-4" />,
};

const formatRange = (start: number, end: number) => {
  const startLabel = formatTimestamp(start);
  const endLabel = formatTimestamp(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

type TimelineEntry =
  | { kind: "event"; event: StageEvent }
  | {
      kind: "group";
      id: string;
      label: string;
      events: StageEvent[];
      occurredAt: number;
    };

interface JobTimelineProps {
  events: StageEvent[];
  onEdit?: (event: StageEvent) => void;
  onDelete?: (eventId: string) => void;
}

export const JobTimeline: React.FC<JobTimelineProps> = ({
  events,
  onEdit,
  onDelete,
}) => {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    {},
  );
  const lastEvent = events.at(-1);
  const currentStage = lastEvent?.toStage ?? null;

  const entries = React.useMemo(() => {
    const groups = new Map<string, { label: string; events: StageEvent[] }>();
    const standalone: StageEvent[] = [];

    events.forEach((event) => {
      const groupId = event.groupId;
      if (!groupId) {
        standalone.push(event);
        return;
      }

      const label = event.metadata?.groupLabel || "Grouped events";
      const group = groups.get(groupId) ?? { label, events: [] };
      group.events.push(event);
      groups.set(groupId, group);
    });

    const mapped: TimelineEntry[] = standalone.map((event) => ({
      kind: "event",
      event,
    }));

    groups.forEach((value, id) => {
      const sorted = [...value.events].sort(
        (a, b) => a.occurredAt - b.occurredAt,
      );
      mapped.push({
        kind: "group",
        id,
        label: value.label,
        events: sorted,
        occurredAt: sorted[0]?.occurredAt ?? 0,
      });
    });

    return mapped.sort((a, b) => {
      const timeA = a.kind === "event" ? a.event.occurredAt : a.occurredAt;
      const timeB = b.kind === "event" ? b.event.occurredAt : b.occurredAt;
      return timeA - timeB;
    });
  }, [events]);

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
        No stage events yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {entries.map((entry, entryIndex) => {
        if (entry.kind === "event") {
          const title = entry.event.title || STAGE_LABELS[entry.event.toStage];
          const note = entry.event.metadata?.note;
          const reason = entry.event.metadata?.reasonCode;
          const isCurrent =
            currentStage === entry.event.toStage &&
            entryIndex === entries.length - 1 &&
            entry.event.toStage !== "applied";
          const isOffer = entry.event.toStage === "offer";
          const salary = entry.event.metadata?.externalUrl?.startsWith(
            "Salary: ",
          )
            ? entry.event.metadata.externalUrl.replace("Salary: ", "")
            : null;
          return (
            <TimelineRow
              key={entry.event.id}
              date={formatTimestampWithTime(entry.event.occurredAt)}
              title={title}
              icon={stageIcons[entry.event.toStage]}
              isCurrent={isCurrent}
              isOffer={isOffer}
              isLast={entryIndex === entries.length - 1}
              onEdit={onEdit ? () => onEdit(entry.event) : undefined}
              onDelete={onDelete ? () => onDelete(entry.event.id) : undefined}
            >
              {note && (
                <div className="text-sm text-muted-foreground">{note}</div>
              )}
              {salary && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  {salary}
                </div>
              )}
              {reason && (
                <Badge
                  variant="outline"
                  className="mt-2 text-[10px] uppercase tracking-wide"
                >
                  {reason}
                </Badge>
              )}
            </TimelineRow>
          );
        }

        const groupOpen = Boolean(openGroups[entry.id]);
        const toggleGroup = () =>
          setOpenGroups((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }));
        const groupStart = entry.events[0]?.occurredAt ?? entry.occurredAt;
        const groupEnd = entry.events.at(-1)?.occurredAt ?? entry.occurredAt;
        const groupCompleted = entry.events.some((event) =>
          /submitted|completed|finished/i.test(event.title || ""),
        );
        const isCurrentGroup =
          currentStage === entry.events.at(-1)?.toStage &&
          entryIndex === entries.length - 1;

        return (
          <div key={entry.id} className="space-y-2">
            <TimelineRow
              date={formatRange(groupStart, groupEnd)}
              title={entry.label}
              icon={<ClipboardList className="h-4 w-4" />}
              isCurrent={isCurrentGroup && !groupCompleted}
              isCompleted={groupCompleted}
              isLast={entryIndex === entries.length - 1}
            >
              <CollapsibleSection
                isOpen={groupOpen}
                label={groupOpen ? "Hide details" : "View details"}
                onToggle={toggleGroup}
              >
                <div className="space-y-4">
                  {entry.events.map((event) => (
                    <TimelineRow
                      key={event.id}
                      date={formatTimestampWithTime(event.occurredAt)}
                      title={event.title || STAGE_LABELS[event.toStage]}
                      icon={stageIcons[event.toStage]}
                      isCompact
                      isLast={false}
                      onEdit={onEdit ? () => onEdit(event) : undefined}
                      onDelete={onDelete ? () => onDelete(event.id) : undefined}
                    >
                      {event.metadata?.note && (
                        <div className="text-xs text-muted-foreground">
                          {event.metadata.note}
                        </div>
                      )}
                    </TimelineRow>
                  ))}
                </div>
              </CollapsibleSection>
            </TimelineRow>
          </div>
        );
      })}
    </div>
  );
};

interface TimelineRowProps {
  date: string;
  title: string;
  icon: React.ReactNode;
  isCurrent?: boolean;
  isOffer?: boolean;
  isCompleted?: boolean;
  isLast?: boolean;
  isCompact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}

const TimelineRow: React.FC<TimelineRowProps> = ({
  date,
  title,
  icon,
  isCurrent,
  isOffer,
  isCompleted,
  isLast,
  isCompact,
  onEdit,
  onDelete,
  children,
}) => {
  const isHollow = Boolean(isCurrent) && !isCompleted;
  const isFilled = !isHollow;

  return (
    <div
      className={cn(
        "group relative",
        isCompact ? "pl-8" : "",
        isOffer && "rounded-lg border border-amber-500/20 bg-amber-500/5 p-4",
      )}
    >
      <div
        className={
          isCompact
            ? "grid grid-cols-[80px_20px_1fr] gap-4"
            : "grid grid-cols-[100px_24px_1fr] gap-4"
        }
      >
        <div className="text-right text-xs font-medium text-muted-foreground">
          {date}
        </div>
        <div className="relative flex flex-col items-center">
          <span className="absolute inset-y-0 w-px bg-border" />
          <div
            className={
              isCompact
                ? "relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                : isHollow
                  ? "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-500 bg-background text-emerald-600 animate-pulse"
                  : isOffer
                    ? "relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                    : "relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
            }
          >
            {isFilled && icon}
          </div>
          {isLast && (
            <span className="absolute bottom-0 h-4 w-px bg-background" />
          )}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div
              className={
                isCompact ? "text-xs font-semibold" : "text-sm font-semibold"
              }
            >
              {title}
            </div>
            {children}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-2 cursor-pointer rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Edit event"
              >
                <Edit2 className="size-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 cursor-pointer rounded-md hover:bg-muted text-destructive/70 hover:text-destructive transition-colors"
                title="Delete event"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
