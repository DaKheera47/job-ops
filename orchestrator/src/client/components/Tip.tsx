import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
  sideOffset?: number;
  delayDuration?: number;
  asChild?: boolean;
  disabled?: boolean;
  clickBehavior?: "toggle" | "none";
};

type TriggerEventProps = {
  onMouseEnter: React.MouseEventHandler;
  onMouseLeave: React.MouseEventHandler;
  onPointerOver: React.PointerEventHandler;
  onPointerOut: React.PointerEventHandler;
  onFocus: React.FocusEventHandler;
  onBlur: React.FocusEventHandler;
  onTouchStart: React.TouchEventHandler;
  onClick: React.MouseEventHandler;
  onKeyDown: React.KeyboardEventHandler;
};

const hasContent = (content: React.ReactNode) =>
  content !== null &&
  content !== undefined &&
  content !== false &&
  content !== "";

const composeEventHandlers =
  <Event extends React.SyntheticEvent>(
    userHandler: ((event: Event) => void) | undefined,
    tipHandler: (event: Event) => void,
  ) =>
  (event: Event) => {
    userHandler?.(event);
    if (!event.defaultPrevented) {
      tipHandler(event);
    }
  };

export function Tip({
  content,
  children,
  className,
  contentClassName,
  side = "top",
  align,
  sideOffset,
  delayDuration = 0,
  asChild = false,
  disabled = false,
  clickBehavior = "toggle",
}: TipProps) {
  const [open, setOpen] = React.useState(false);
  const ignoreNextClickRef = React.useRef(false);
  const enabled = !disabled && hasContent(content);

  React.useEffect(() => {
    if (!enabled && open) {
      setOpen(false);
    }
  }, [enabled, open]);

  const eventProps: TriggerEventProps = {
    onMouseEnter: () => {
      if (enabled) setOpen(true);
    },
    onMouseLeave: () => {
      setOpen(false);
    },
    onPointerOver: () => {
      if (enabled) setOpen(true);
    },
    onPointerOut: () => {
      setOpen(false);
    },
    onFocus: () => {
      if (enabled) setOpen(true);
    },
    onBlur: () => {
      setOpen(false);
    },
    onTouchStart: () => {
      if (!enabled) return;
      ignoreNextClickRef.current = true;
      setOpen((current) => !current);
    },
    onClick: () => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }
      if (enabled && clickBehavior === "toggle") {
        setOpen((current) => !current);
      }
    },
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    },
  };

  const trigger =
    asChild && React.isValidElement(children) ? (
      React.cloneElement(
        children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
        {
          className: cn(
            (children.props as { className?: string }).className,
            className,
          ),
          onMouseEnter: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onMouseEnter,
            eventProps.onMouseEnter,
          ),
          onMouseLeave: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onMouseLeave,
            eventProps.onMouseLeave,
          ),
          onFocus: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onFocus,
            eventProps.onFocus,
          ),
          onPointerOver: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onPointerOver,
            eventProps.onPointerOver,
          ),
          onPointerOut: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onPointerOut,
            eventProps.onPointerOut,
          ),
          onBlur: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onBlur,
            eventProps.onBlur,
          ),
          onTouchStart: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onTouchStart,
            eventProps.onTouchStart,
          ),
          onClick: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onClick,
            eventProps.onClick,
          ),
          onKeyDown: composeEventHandlers(
            (children.props as React.HTMLAttributes<HTMLElement>).onKeyDown,
            eventProps.onKeyDown,
          ),
        },
      )
    ) : asChild ? (
      children
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center justify-center bg-transparent p-0 text-inherit",
          className,
        )}
        {...eventProps}
      >
        {children}
      </button>
    );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={contentClassName}
        >
          {typeof content === "string" ? (
            <span className="inline-block">{content}</span>
          ) : (
            content
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
