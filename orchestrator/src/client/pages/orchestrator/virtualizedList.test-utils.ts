type VirtualElementSize = {
  height?: number;
  width?: number;
};

const DEFAULT_RECT = {
  height: 0,
  width: 0,
};

const readRectSize = (element: Element) => {
  const htmlElement = element as HTMLElement;
  const height =
    Number(htmlElement.dataset.virtualHeight) || DEFAULT_RECT.height;
  const width = Number(htmlElement.dataset.virtualWidth) || DEFAULT_RECT.width;
  return { height, width };
};

export const setVirtualElementSize = (
  element: HTMLElement,
  size: VirtualElementSize,
) => {
  if (size.height != null) {
    element.dataset.virtualHeight = String(size.height);
  }

  if (size.width != null) {
    element.dataset.virtualWidth = String(size.width);
  }
};

export const installVirtualizerSizeMock = () => {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;
  const originalResizeObserver = globalThis.ResizeObserver;

  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const { height, width } = readRectSize(this);
      return {
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      } as DOMRect;
    },
  });

  class VirtualResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      const contentRect = target.getBoundingClientRect();
      this.callback(
        [
          {
            target,
            contentRect,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    unobserve() {}

    disconnect() {}
  }

  globalThis.ResizeObserver = VirtualResizeObserver as typeof ResizeObserver;

  return () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: originalGetBoundingClientRect,
    });
    globalThis.ResizeObserver = originalResizeObserver;
  };
};
