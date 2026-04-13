import { useCallback, useState } from "react";
import { useVirtualizedList as useSharedVirtualizedList } from "@/client/lib/virtual-list";

export interface UseVirtualizedListOptions {
  count: number;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string | number | bigint;
  overscan?: number;
  enabled?: boolean;
  initialRect?: {
    height: number;
    width: number;
  };
}

export const useVirtualizedList = ({
  count,
  enabled = true,
  estimateSize,
  getItemKey,
  initialRect,
  overscan = 8,
}: UseVirtualizedListOptions) => {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const scrollElementRef = useCallback((element: HTMLDivElement | null) => {
    setScrollElement(element);
  }, []);

  const virtualizer = useSharedVirtualizedList({
    count,
    mode: "element",
    scrollElement,
    estimateSize,
    getItemKey,
    enabled,
    initialRect,
    overscan,
  });

  return {
    scrollElementRef,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
    scrollToIndex: virtualizer.scrollToIndex,
  };
};
