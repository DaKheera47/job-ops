import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import {
  type MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { GripVertical } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trackProductEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  DESIGN_RESUME_ICON_GROUPS,
  type DesignResumeSectionId,
} from "./constants";
import { getSectionOrder, REORDERABLE_SECTION_KEYS } from "./utils";

const useDockItemSize = (
  mouseY: MotionValue<number>,
  baseItemSize: number,
  magnification: number,
  distance: number,
  ref: React.RefObject<HTMLButtonElement | null>,
  spring: { mass: number; stiffness: number; damping: number },
) => {
  const mouseDistance = useTransform(mouseY, (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    const rect = ref.current?.getBoundingClientRect() ?? {
      y: 0,
      height: baseItemSize,
    };
    return value - rect.y - baseItemSize / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize],
  );

  return useSpring(targetSize, spring);
};

type DesignResumeDockItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badgeCount?: number;
  isReorderable?: boolean;
  isDragging?: boolean;
  isDragTarget?: boolean;
  isCandidate?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
};

type DesignResumeDockButtonProps = DesignResumeDockItem & {
  mouseY: MotionValue<number>;
  baseItemSize: number;
  magnification: number;
  distance: number;
  spring: { mass: number; stiffness: number; damping: number };
};

function DesignResumeDockButton({
  icon,
  label,
  active,
  onClick,
  mouseY,
  baseItemSize,
  magnification,
  distance,
  spring,
  badgeCount,
  isReorderable,
  isDragging,
  isDragTarget,
  isCandidate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: DesignResumeDockButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const size = useDockItemSize(
    mouseY,
    baseItemSize,
    magnification,
    distance,
    ref,
    spring,
  );

  return (
    <motion.div
      layout
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      draggable={isReorderable}
      // biome-ignore lint/suspicious/noExplicitAny: Framer Motion onDragStart type conflicts with native HTML5 drag events
      onDragStart={onDragStart as any}
      // biome-ignore lint/suspicious/noExplicitAny: Framer Motion onDragEnd type conflicts with native HTML5 drag events
      onDragEnd={onDragEnd as any}
      // biome-ignore lint/suspicious/noExplicitAny: Framer Motion onDragOver type conflicts with native HTML5 drag events
      onDragOver={onDragOver as any}
      // biome-ignore lint/suspicious/noExplicitAny: Framer Motion onDrop type conflicts with native HTML5 drag events
      onDrop={onDrop as any}
      className="group relative flex shrink-0 items-center justify-center cursor-grab"
    >
      {isReorderable && (
        <GripVertical
          className="absolute -left-2 h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 pointer-events-none"
          aria-hidden="true"
        />
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            ref={ref}
            onClick={onClick}
            style={{ width: size, height: size }}
            animate={{
              scale: isDragging
                ? 0.9
                : isDragTarget
                  ? 1.1
                  : isCandidate
                    ? 0.96
                    : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
            }}
            className={cn(
              "relative inline-flex cursor-grab shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-md outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ml-4 -translate-x-2",
              isDragTarget
                ? "border-primary shadow-primary/30 border-solid"
                : isCandidate
                  ? "border-dashed border-primary/45 bg-primary/5 text-primary/80 shadow-sm shadow-primary/5"
                  : active
                    ? "border-primary/50 bg-primary/12 text-primary shadow-primary/20"
                    : "border-border/70 hover:border-border hover:bg-accent/70",
            )}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="[&_svg]:h-5 [&_svg]:w-5 transition-all duration-150">
              {icon}
            </span>
            {badgeCount !== undefined && badgeCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            ) : null}
          </motion.button>
        </TooltipTrigger>

        <TooltipContent
          side="right"
          sideOffset={12}
          className="border border-border/70 bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </motion.div>
  );
}

export type DesignResumeIconRailProps = {
  activeSectionId: DesignResumeSectionId | null;
  onSectionSelect: (sectionId: DesignResumeSectionId | null) => void;
  className?: string;
  draft: DesignResumeDocument | null;
  onUpdateResumeJson: (
    updater: (resumeJson: DesignResumeJson) => DesignResumeJson,
  ) => void;
};

export function DesignResumeDock({
  activeSectionId,
  onSectionSelect,
  className,
  draft,
  onUpdateResumeJson,
}: DesignResumeIconRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY);
  const spring = { mass: 0.1, stiffness: 150, damping: 12 };
  const panelWidth = 76;
  const magnification = 64;
  const baseItemSize = 46;
  const distance = 200;
  const railPadding = 12;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [railHeight, setRailHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const resetDragState = useCallback(() => {
    setDraggingKey(null);
    setDragOverKey(null);
  }, []);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, key: string) => {
      setDraggingKey(key);
      setDragOverKey(key);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", key);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, key: string) => {
      if (draggingKey == null) return;
      if (
        !REORDERABLE_SECTION_KEYS.includes(draggingKey) ||
        !REORDERABLE_SECTION_KEYS.includes(key)
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverKey(key);
    },
    [draggingKey],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, targetKey: string) => {
      event.preventDefault();
      const sourceKey = event.dataTransfer.getData("text/plain") || draggingKey;
      if (!sourceKey || sourceKey === targetKey) {
        resetDragState();
        return;
      }

      if (
        !REORDERABLE_SECTION_KEYS.includes(sourceKey) ||
        !REORDERABLE_SECTION_KEYS.includes(targetKey)
      ) {
        resetDragState();
        return;
      }

      onUpdateResumeJson((current) => {
        const next = structuredClone(current);
        const currentOrder = getSectionOrder(next as Record<string, unknown>);
        const fromIndex = currentOrder.indexOf(sourceKey);
        const toIndex = currentOrder.indexOf(targetKey);
        if (fromIndex !== -1 && toIndex !== -1) {
          const nextOrder = [...currentOrder];
          const [removed] = nextOrder.splice(fromIndex, 1);
          nextOrder.splice(toIndex, 0, removed);

          if (!next.metadata) {
            next.metadata = {} as DesignResumeJson["metadata"];
          }
          if (!next.metadata.layout) {
            next.metadata.layout = { sidebarWidth: 0, pages: [] };
          }
          if (!next.metadata.layout.pages) {
            next.metadata.layout.pages = [];
          }
          if (next.metadata.layout.pages.length === 0) {
            next.metadata.layout.pages.push({
              fullWidth: false,
              main: nextOrder,
              sidebar: [],
            });
          } else {
            next.metadata.layout.pages[0].main = nextOrder;
          }
        }
        return next;
      });

      trackProductEvent("resume_studio_section_edited", {
        section: sourceKey,
        action: "reorder",
        item_count_bucket: "0",
        device_layout:
          typeof window !== "undefined" &&
          window.matchMedia?.("(max-width: 639px)").matches
            ? "mobile"
            : "desktop",
      });

      resetDragState();
    },
    [draggingKey, onUpdateResumeJson, resetDragState],
  );

  const items = useMemo(() => {
    return DESIGN_RESUME_ICON_GROUPS.flatMap((group) => {
      let groupItems = group.items;
      if (group.id === "sections" && draft) {
        const order = getSectionOrder(
          draft.resumeJson as Record<string, unknown>,
        );
        const reorderable = groupItems.filter((item) =>
          REORDERABLE_SECTION_KEYS.includes(item.id),
        );
        reorderable.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

        let reorderableIndex = 0;
        groupItems = groupItems.map((item) => {
          if (REORDERABLE_SECTION_KEYS.includes(item.id)) {
            return reorderable[reorderableIndex++];
          }
          return item;
        });
      }

      return groupItems.map((item) => {
        const Icon = item.icon;
        const sectionId =
          item.sectionId === undefined ? item.id : item.sectionId;
        const isReorderable = REORDERABLE_SECTION_KEYS.includes(item.id);
        const isCandidate =
          draggingKey !== null && isReorderable && draggingKey !== item.id;
        return {
          id: item.id,
          icon: <Icon aria-hidden="true" />,
          label: item.label,
          active: sectionId === activeSectionId,
          onClick: () => onSectionSelect(sectionId),
          isReorderable,
          isDragging: draggingKey === item.id,
          isDragTarget: dragOverKey === item.id && draggingKey !== item.id,
          isCandidate,
          onDragStart: isReorderable
            ? (e: React.DragEvent<HTMLButtonElement>) =>
                handleDragStart(e, item.id)
            : undefined,
          onDragEnd: isReorderable ? handleDragEnd : undefined,
          onDragOver: isReorderable
            ? (e: React.DragEvent<HTMLButtonElement>) =>
                handleDragOver(e, item.id)
            : undefined,
          onDrop: isReorderable
            ? (e: React.DragEvent<HTMLButtonElement>) => handleDrop(e, item.id)
            : undefined,
        };
      });
    });
  }, [
    draft,
    activeSectionId,
    onSectionSelect,
    draggingKey,
    dragOverKey,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  ]);

  const maxScrollOffset = Math.max(
    0,
    contentHeight + railPadding * 2 - railHeight,
  );

  useEffect(() => {
    const rail = railRef.current;
    const content = contentRef.current;
    if (!rail || !content) return;

    const updateRailHeight = () => setRailHeight(rail.clientHeight);
    const updateContentHeight = () => setContentHeight(content.scrollHeight);
    updateRailHeight();
    updateContentHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateRailHeight();
      updateContentHeight();
    });
    resizeObserver.observe(rail);
    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset));
  }, [maxScrollOffset]);

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (maxScrollOffset <= 0) return;
    event.preventDefault();
    setScrollOffset((current) =>
      Math.min(Math.max(current + event.deltaY, 0), maxScrollOffset),
    );
  };

  return (
    <div
      style={{ width: panelWidth }}
      className={cn(
        "pointer-events-none z-30 flex items-start justify-end justify-self-end",
        className,
      )}
    >
      <TooltipProvider delayDuration={0} skipDelayDuration={80}>
        <motion.nav
          ref={railRef}
          onMouseMove={({ clientY }) => {
            mouseY.set(clientY);
          }}
          onMouseLeave={() => {
            mouseY.set(Number.POSITIVE_INFINITY);
          }}
          onBlur={() => mouseY.set(Number.POSITIVE_INFINITY)}
          onWheel={handleWheel}
          className="pointer-events-auto relative h-full min-h-0 w-[64px] overflow-x-visible overflow-y-clip overscroll-contain rounded-2xl border border-border/80 bg-card/95 shadow-2xl shadow-background/50 backdrop-blur supports-[backdrop-filter]:bg-card/85"
          role="toolbar"
          aria-label="Resume Studio sections"
        >
          <motion.div
            ref={contentRef}
            className="absolute left-0 right-0 top-3 flex flex-col items-center gap-2"
            style={{ y: -scrollOffset }}
          >
            {items.map((item) => (
              <DesignResumeDockButton
                key={item.id}
                {...item}
                mouseY={mouseY}
                baseItemSize={baseItemSize}
                magnification={magnification}
                distance={distance}
                spring={spring}
              />
            ))}
          </motion.div>
        </motion.nav>
      </TooltipProvider>
    </div>
  );
}
