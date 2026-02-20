import type React from "react";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface AnimateOutProps {
  show: boolean;
  enterClassName?: string;
  exitClassName?: string;
  onExitComplete?: () => void;
  children: React.ReactElement<{
    className?: string;
    onAnimationEnd?: React.AnimationEventHandler<HTMLElement>;
  }>;
}

export const AnimateOut: React.FC<AnimateOutProps> = ({
  show,
  enterClassName,
  exitClassName,
  onExitComplete,
  children,
}) => {
  const [isMounted, setIsMounted] = useState(show);
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    if (show) {
      if (!isMounted) setIsMounted(true);
      return;
    }
    if (!exitClassName) {
      setIsMounted(false);
      onExitComplete?.();
    }
  }, [show, isMounted, exitClassName, onExitComplete]);

  if ((!show && !isMounted) || !isValidElement(children)) return null;

  const previousOnAnimationEnd =
    typeof children.props.onAnimationEnd === "function"
      ? children.props.onAnimationEnd
      : undefined;

  const onAnimationEnd: React.AnimationEventHandler<HTMLElement> = (event) => {
    previousOnAnimationEnd?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (showRef.current) return;
    setIsMounted(false);
    onExitComplete?.();
  };

  return cloneElement(children, {
    className: cn(
      children.props.className,
      show ? enterClassName : exitClassName,
    ),
    onAnimationEnd,
  });
};
