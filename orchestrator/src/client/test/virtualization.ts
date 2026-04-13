import { vi } from "vitest";

type WindowVirtualizerTestEnvironmentOptions = {
  viewportHeight?: number;
  rowHeight?: number;
};

export const setupWindowVirtualizerTestEnvironment = (
  options: WindowVirtualizerTestEnvironmentOptions = {},
) => {
  const { viewportHeight = 240, rowHeight = 84 } = options;
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

  const offsetHeightSpy = vi
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.virtualRow === "true") {
        return rowHeight;
      }
      return 0;
    });

  const cleanup = () => {
    offsetHeightSpy.mockRestore();

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
  };
};
