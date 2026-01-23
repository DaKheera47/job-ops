import React from "react";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  MailCheck,
  PhoneCall,
  Video,
  XCircle,
} from "lucide-react";

import { Timeline, TimelineEmpty, TimelineItem } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import type { ApplicationStage, StageEvent } from "../../../shared/types";
import { CollapsibleSection } from "../../components/discovered-panel/CollapsibleSection";

const stageLabels: Record<ApplicationStage, string> = {
  applied: "Applied",
  recruiter_screen: "Recruiter screen",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

const stageIcons: Record<ApplicationStage, React.ReactNode> = {
  applied: <CheckCircle2 className="h-4 w-4" />,
  recruiter_screen: <PhoneCall className="h-4 w-4" />,
  assessment: <FileText className="h-4 w-4" />,
  interview: <Video className="h-4 w-4" />,
  offer: <MailCheck className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  withdrawn: <XCircle className="h-4 w-4" />,
  closed: <ClipboardList className="h-4 w-4" />,
};

const formatTimestamp = (value: number) => new Date(value * 1000).toISOString();

type TimelineEntry =
  | { kind: "event"; event: StageEvent }
  | { kind: "group"; id: string; label: string; events: StageEvent[]; occurredAt: number };

interface JobTimelineProps {
  events: StageEvent[];
}

export const JobTimeline: React.FC<JobTimelineProps> = ({ events }) => {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  const entries = React.useMemo(() => {
    const groups = new Map<string, { label: string; events: StageEvent[] }>();
    const standalone: StageEvent[] = [];

    events.forEach((event) => {
      const groupId = event.metadata?.groupId ?? null;
      if (!groupId) {
        standalone.push(event);
        return;
      }

      const label = event.metadata?.groupLabel || "Grouped events";
      const group = groups.get(groupId) ?? { label, events: [] };
      group.events.push(event);
      groups.set(groupId, group);
    });

    const mapped: TimelineEntry[] = standalone.map((event) => ({ kind: "event", event }));

    groups.forEach((value, id) => {
      const sorted = [...value.events].sort((a, b) => a.occurredAt - b.occurredAt);
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
    return <TimelineEmpty>No stage events yet.</TimelineEmpty>;
  }

  return (
    <Timeline className="max-w-none">
      {entries.map((entry) => {
        if (entry.kind === "event") {
          const title = entry.event.metadata?.eventLabel || stageLabels[entry.event.toStage];
          const description = entry.event.metadata?.note || "";
          return (
            <TimelineItem
              key={entry.event.id}
              date={formatTimestamp(entry.event.occurredAt)}
              title={title}
              description={description}
              icon={stageIcons[entry.event.toStage]}
              status="completed"
            />
          );
        }

        const groupOpen = Boolean(openGroups[entry.id]);
        const toggleGroup = () =>
          setOpenGroups((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }));

        return (
          <TimelineItem
            key={entry.id}
            date={formatTimestamp(entry.occurredAt)}
            title={entry.label}
            description={
              <CollapsibleSection
                isOpen={groupOpen}
                label={groupOpen ? "Hide details" : "View details"}
                onToggle={toggleGroup}
              >
                <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
                  {entry.events.map((event) => (
                    <div key={event.id} className="flex items-start justify-between gap-4 text-xs">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground/80">
                          {event.metadata?.eventLabel || stageLabels[event.toStage]}
                        </div>
                        {event.metadata?.note && (
                          <div className="text-muted-foreground/80">{event.metadata.note}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {stageLabels[event.toStage]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            }
            icon={<ClipboardList className="h-4 w-4" />}
            status="completed"
          />
        );
      })}
    </Timeline>
  );
};
