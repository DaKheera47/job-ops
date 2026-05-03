import {
  elementScroll,
  useVirtualizer,
  useWindowVirtualizer,
  type Virtualizer,
  windowScroll,
} from "@tanstack/react-virtual";

export type VirtualListScrollAlignment = "auto" | "center" | "end" | "start";
export type VirtualListScrollBehavior = "auto" | "instant" | "smooth";

export interface VirtualListHandle {
  scrollToIndex: (
    index: number,
    options?: {
      align?: VirtualListScrollAlignment;
      behavior?: VirtualListScrollBehavior;
    },
  ) => void;
}

type VirtualizedListBaseOptions = {
  count: number;
  estimateSize?: (index: number) => number;
  getItemKey?: (index: number) => string | number | bigint;
  overscan?: number;
  enabled?: boolean;
  initialRect?: {
    height: number;
    width: number;
  };
};

type WindowVirtualizedListOptions = VirtualizedListBaseOptions & {
  mode?: "window";
};

type ElementVirtualizedListOptions<TScrollElement extends Element> =
  VirtualizedListBaseOptions & {
    mode: "element";
    scrollElement: TScrollElement | null;
  };

type ScrollObserverCleanup = () => void;

type DebouncedCallback = ((...args: []) => void) & {
  cancel: () => void;
};

const addEventListenerOptions = {
  passive: true,
};

const supportsScrollEnd =
  typeof window === "undefined" ? true : "onscrollend" in window;

const createDebouncedCallback = (
  targetWindow: Window & typeof globalThis,
  fn: () => void,
  ms: number,
): DebouncedCallback => {
  let timeoutId: number | undefined;

  const callback = (() => {
    if (timeoutId !== undefined) {
      targetWindow.clearTimeout(timeoutId);
    }
    timeoutId = targetWindow.setTimeout(() => {
      timeoutId = undefined;
      fn();
    }, ms);
  }) as DebouncedCallback;

  callback.cancel = () => {
    if (timeoutId !== undefined) {
      targetWindow.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return callback;
};

const observeElementOffsetWithCleanup = <
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  instance: Virtualizer<TScrollElement, TItemElement>,
  cb: (offset: number, isScrolling: boolean) => void,
): ScrollObserverCleanup | undefined => {
  const scrollElement = instance.scrollElement;
  if (!scrollElement) return;

  const targetWindow = instance.targetWindow as
    | (Window & typeof globalThis)
    | null;
  if (!targetWindow) return;

  let offset = 0;
  const fallback =
    instance.options.useScrollendEvent && supportsScrollEnd
      ? null
      : createDebouncedCallback(
          targetWindow,
          () => cb(offset, false),
          instance.options.isScrollingResetDelay,
        );

  const createHandler = (isScrolling: boolean) => () => {
    const { horizontal, isRtl } = instance.options;
    offset = horizontal
      ? scrollElement.scrollLeft * ((isRtl && -1) || 1)
      : scrollElement.scrollTop;
    fallback?.();
    cb(offset, isScrolling);
  };

  const handler = createHandler(true);
  const endHandler = createHandler(false);
  const registerScrollEndEvent =
    instance.options.useScrollendEvent && supportsScrollEnd;

  scrollElement.addEventListener("scroll", handler, addEventListenerOptions);
  if (registerScrollEndEvent) {
    scrollElement.addEventListener(
      "scrollend",
      endHandler,
      addEventListenerOptions,
    );
  }

  return () => {
    scrollElement.removeEventListener("scroll", handler);
    if (registerScrollEndEvent) {
      scrollElement.removeEventListener("scrollend", endHandler);
    }
    fallback?.cancel();
  };
};

const observeWindowOffsetWithCleanup = <TItemElement extends Element>(
  instance: Virtualizer<Window, TItemElement>,
  cb: (offset: number, isScrolling: boolean) => void,
): ScrollObserverCleanup | undefined => {
  const scrollElement = instance.scrollElement;
  if (!scrollElement) return;

  const targetWindow = instance.targetWindow as
    | (Window & typeof globalThis)
    | null;
  if (!targetWindow) return;

  let offset = 0;
  const fallback =
    instance.options.useScrollendEvent && supportsScrollEnd
      ? null
      : createDebouncedCallback(
          targetWindow,
          () => cb(offset, false),
          instance.options.isScrollingResetDelay,
        );

  const createHandler = (isScrolling: boolean) => () => {
    offset = scrollElement[instance.options.horizontal ? "scrollX" : "scrollY"];
    fallback?.();
    cb(offset, isScrolling);
  };

  const handler = createHandler(true);
  const endHandler = createHandler(false);
  const registerScrollEndEvent =
    instance.options.useScrollendEvent && supportsScrollEnd;

  scrollElement.addEventListener("scroll", handler, addEventListenerOptions);
  if (registerScrollEndEvent) {
    scrollElement.addEventListener(
      "scrollend",
      endHandler,
      addEventListenerOptions,
    );
  }

  return () => {
    scrollElement.removeEventListener("scroll", handler);
    if (registerScrollEndEvent) {
      scrollElement.removeEventListener("scrollend", endHandler);
    }
    fallback?.cancel();
  };
};

export function useVirtualizedList<
  TItemElement extends Element = HTMLDivElement,
>(options: WindowVirtualizedListOptions): Virtualizer<Window, TItemElement>;
export function useVirtualizedList<
  TScrollElement extends Element,
  TItemElement extends Element = HTMLDivElement,
>(
  options: ElementVirtualizedListOptions<TScrollElement>,
): Virtualizer<TScrollElement, TItemElement>;
export function useVirtualizedList<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options:
    | WindowVirtualizedListOptions
    | ElementVirtualizedListOptions<TScrollElement>,
) {
  const {
    count,
    estimateSize = () => 84,
    getItemKey,
    overscan = 8,
    enabled = true,
    initialRect,
  } = options;
  const isElementMode = options.mode === "element";
  const isJsdom =
    typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");

  const scrollWindow = (
    offset: number,
    {
      adjustments = 0,
      behavior,
    }: {
      adjustments?: number;
      behavior?: VirtualListScrollBehavior;
    },
    instance: Virtualizer<Window, TItemElement>,
  ) => {
    if (!isJsdom) {
      windowScroll(offset, { adjustments, behavior }, instance);
      return;
    }

    const scrollElement = instance.scrollElement;
    if (!scrollElement) return;

    const nextOffset = offset + adjustments;
    const property = instance.options.horizontal ? "scrollX" : "scrollY";

    try {
      (scrollElement as unknown as Record<string, unknown>)[property] =
        nextOffset;
    } catch {
      try {
        Object.defineProperty(scrollElement, property, {
          configurable: true,
          value: nextOffset,
        });
      } catch {
        // JSDOM exposes scroll offsets through read-only accessors, so fall
        // back to a scroll event only when we cannot patch the property.
      }
    }

    scrollElement.dispatchEvent(new Event("scroll"));
  };

  const scrollElement = (
    offset: number,
    {
      adjustments = 0,
      behavior,
    }: {
      adjustments?: number;
      behavior?: VirtualListScrollBehavior;
    },
    instance: Virtualizer<TScrollElement, TItemElement>,
  ) => {
    if (!isJsdom) {
      elementScroll(offset, { adjustments, behavior }, instance);
      return;
    }

    const nextScrollElement = instance.scrollElement;
    if (!nextScrollElement) return;

    const nextOffset = offset + adjustments;
    const property = instance.options.horizontal ? "scrollLeft" : "scrollTop";

    try {
      (nextScrollElement as Record<string, unknown>)[property] = nextOffset;
    } catch {
      try {
        Object.defineProperty(nextScrollElement, property, {
          configurable: true,
          value: nextOffset,
        });
      } catch {
        // Same JSDOM fallback as above.
      }
    }

    nextScrollElement.dispatchEvent(new Event("scroll"));
  };

  const elementVirtualizer = useVirtualizer<TScrollElement, TItemElement>({
    count,
    estimateSize,
    getItemKey,
    overscan,
    enabled: enabled && isElementMode,
    initialRect,
    getScrollElement: () =>
      options.mode === "element" ? options.scrollElement : null,
    observeElementOffset: observeElementOffsetWithCleanup,
    scrollToFn: scrollElement,
    useFlushSync: false,
  });

  const windowVirtualizer = useWindowVirtualizer<TItemElement>({
    count,
    estimateSize,
    getItemKey,
    overscan,
    enabled: enabled && !isElementMode,
    initialRect,
    observeElementOffset: observeWindowOffsetWithCleanup,
    scrollToFn: scrollWindow,
    useFlushSync: false,
  });

  return isElementMode ? elementVirtualizer : windowVirtualizer;
}
