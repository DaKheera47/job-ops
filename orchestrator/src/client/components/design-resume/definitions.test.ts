import { describe, expect, it } from "vitest";
import { ITEM_DEFINITIONS } from "./definitions";

describe("ITEM_DEFINITIONS", () => {
  it("creates new project items without browser randomUUID support", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues<TArray extends ArrayBufferView | null>(
          array: TArray,
        ): TArray {
          if (array && ArrayBuffer.isView(array)) {
            const bytes = new Uint8Array(
              array.buffer,
              array.byteOffset,
              array.byteLength,
            );
            bytes.fill(1);
          }
          return array;
        },
      },
    });

    try {
      const projectsDefinition = ITEM_DEFINITIONS.find(
        (definition) => definition.key === "projects",
      );

      expect(projectsDefinition).toBeDefined();
      const item = projectsDefinition?.createItem();

      expect(item?.id).toEqual(expect.any(String));
      expect(String(item?.id).trim()).not.toBe("");
      expect(item?.name).toBe("");
      expect(item?.hidden).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});
