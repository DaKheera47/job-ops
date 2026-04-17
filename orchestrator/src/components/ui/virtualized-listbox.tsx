"use client";

import type { Key } from "react";
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
  scrollElement?: HTMLElement | null;
};

export function useVirtualizedListbox<
  TItemElement extends HTMLElement = HTMLElement,
>({
  count,
  estimateSize = () => 40,
  enabled = true,
  getItemKey,
  initialRect,
  overscan = 8,
  scrollElement = null,
}: UseVirtualizedListboxOptions) {
  const virtualizer = useVirtualizedList<HTMLElement, TItemElement>({
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
    measureElement: (
      node: Parameters<typeof virtualizer.measureElement>[0],
    ) => {
      virtualizer.measureElement(node);
    },
    scrollToIndex: (
      index: number,
      options?: Parameters<typeof virtualizer.scrollToIndex>[1],
    ) => virtualizer.scrollToIndex(index, options),
  };
}
