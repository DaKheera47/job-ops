import { useEffect, useRef, useState } from "react";

/**
 * A custom React hook that animates counting up/down to a target value.
 * Uses requestAnimationFrame and easeOutQuad easing for premium 60fps animations.
 * Keeps track of the previous target score to animate incrementally between changes (ticker behavior).
 * Bypasses animations in test environments for test determinism.
 */
export const useCountUp = (target: number | null, durationMs = 600) => {
  const isTest =
    typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  const [count, setCount] = useState<number | null>(
    target === null ? null : target,
  );
  const prevTargetRef = useRef<number>(0);

  useEffect(() => {
    if (target === null) {
      setCount(null);
      prevTargetRef.current = 0;
      return;
    }

    if (isTest) {
      setCount(target);
      prevTargetRef.current = target;
      return;
    }

    const start = prevTargetRef.current;
    const end = Math.round(target);
    prevTargetRef.current = end;

    if (start === end) {
      setCount(end);
      return;
    }

    const startTime = performance.now();
    let animationFrameId: number;

    const updateCount = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // easeOutQuad easing
      const easeProgress = progress * (2 - progress);

      const current = Math.round(start + (end - start) * easeProgress);
      setCount(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateCount);
      }
    };

    animationFrameId = requestAnimationFrame(updateCount);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [target, durationMs, isTest]);

  return count;
};
