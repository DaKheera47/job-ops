declare module "tinykeys" {
  export type KeyBindingMap = Record<string, (event: KeyboardEvent) => void>;

  export interface KeyBindingOptions {
    event?: "keydown" | "keyup";
    timeout?: number;
  }

  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingOptions,
  ): () => void;
}
