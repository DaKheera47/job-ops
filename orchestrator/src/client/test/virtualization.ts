import { vi } from "vitest";

type WindowVirtualizerTestEnvironmentOptions = {
  viewportHeight?: number;
  rowHeight?: number;
  listOffsetTop?: number;
  /**
   * Scrollable height of the document. Window virtualizers clamp programmatic
   * scrolls to it, and jsdom always reports 0, so scroll-to-index behaviour is
   * only observable once this is set.
   */
  documentHeight?: number;
};

const emptyRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON() {
    return this;
  },
} as DOMRect;

export const setupWindowVirtualizerTestEnvironment = (
  options: WindowVirtualizerTestEnvironmentOptions = {},
) => {
  const { viewportHeight = 240, rowHeight = 84 } = options;
  let listOffsetTop = options.listOffsetTop ?? 0;
  const innerHeightDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight",
  );
  const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY");
  const scrollY = window.scrollY ?? 0;

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: viewportHeight,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: scrollY,
    writable: true,
  });

  const { documentElement } = document;
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
    documentElement,
    "scrollHeight",
  );
  if (options.documentHeight != null) {
    Object.defineProperty(documentElement, "scrollHeight", {
      configurable: true,
      value: options.documentHeight,
    });
  }

  const offsetHeightSpy = vi
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.virtualRow === "true") {
        return rowHeight;
      }
      return 0;
    });

  // Only the virtualized list container reports a position, so window
  // virtualizers can resolve how far down the document the list starts.
  const boundingRectSpy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.virtualList !== "true") {
        return emptyRect;
      }

      const top = listOffsetTop - (window.scrollY ?? 0);
      return {
        ...emptyRect,
        bottom: top,
        top,
        y: top,
      } as DOMRect;
    });

  /**
   * Simulates content above the list growing or shrinking, e.g. the pipeline
   * progress card mounting while a search run is in flight.
   */
  const setListOffsetTop = (nextListOffsetTop: number) => {
    listOffsetTop = nextListOffsetTop;
  };

  const cleanup = () => {
    offsetHeightSpy.mockRestore();
    boundingRectSpy.mockRestore();

    if (scrollHeightDescriptor) {
      Object.defineProperty(
        documentElement,
        "scrollHeight",
        scrollHeightDescriptor,
      );
    } else {
      Reflect.deleteProperty(documentElement, "scrollHeight");
    }

    if (innerHeightDescriptor) {
      Object.defineProperty(window, "innerHeight", innerHeightDescriptor);
    } else {
      Reflect.deleteProperty(window, "innerHeight");
    }

    if (scrollYDescriptor) {
      Object.defineProperty(window, "scrollY", scrollYDescriptor);
    } else {
      Reflect.deleteProperty(window, "scrollY");
    }
  };

  return {
    cleanup,
    setListOffsetTop,
  };
};
