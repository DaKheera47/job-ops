"use client";

import type { Key, RefObject } from "react";
import { useLayoutEffect, useState } from "react";
import {
  useVirtualizedList,
  type VirtualListScrollAlignment,
  type VirtualListScrollBehavior,
} from "@/client/lib/virtual-list";

export type VirtualizedListHandle = {
  scrollToIndex: (
    index: number,
    options?: {
      align?: VirtualListScrollAlignment;
      behavior?: VirtualListScrollBehavior;
    },
  ) => void;
};

export type UseVirtualizedListboxOptions = {
  count: number;
  estimateSize?: (index: number) => number;
  enabled?: boolean;
  getItemKey?: (index: number) => Key;
  initialRect?: {
    height: number;
    width: number;
  };
  overscan?: number;
  scrollElementRef?: RefObject<HTMLElement | null>;
};

export function useVirtualizedListbox({
  count,
  estimateSize = () => 40,
  enabled = true,
  getItemKey,
  initialRect,
  overscan = 8,
  scrollElementRef,
}: UseVirtualizedListboxOptions) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const nextElement = scrollElementRef?.current ?? null;
    setScrollElement((current) =>
      current === nextElement ? current : nextElement,
    );
  });

  const virtualizer = useVirtualizedList({
    count,
    mode: "element",
    scrollElement,
    estimateSize,
    enabled,
    getItemKey,
    initialRect,
    overscan,
  });

  return {
    getTotalSize: () => virtualizer.getTotalSize(),
    getVirtualItems: () => virtualizer.getVirtualItems(),
    measureElement: (node: Element | null) => {
      virtualizer.measureElement(node as HTMLDivElement | null);
    },
    scrollToIndex: (
      index: number,
      options?: Parameters<typeof virtualizer.scrollToIndex>[1],
    ) => virtualizer.scrollToIndex(index, options),
  };
}
