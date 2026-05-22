import type { DesignResumeDocument } from "@shared/types";
import type { ItemDefinition } from "./definitions";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function getByPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function setByPath(
  source: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(source) as Record<string, unknown>;
  const segments = path.split(".");
  let cursor = next;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1] ?? path] = value;
  return next;
}

export function fieldId(...parts: string[]): string {
  return `design-resume-${parts.join("-").replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function makeDownload(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function getDesignResumeDialogItem(
  draft: DesignResumeDocument | null,
  definition: ItemDefinition,
  index: number | null,
) {
  if (!draft || index == null) return null;
  const sections = (asRecord(draft.resumeJson.sections) ?? {}) as Record<
    string,
    unknown
  >;
  const section = (asRecord(sections[definition.key]) ?? {}) as Record<
    string,
    unknown
  >;
  const items = asArray(section.items).map(
    (item) => asRecord(item) ?? {},
  ) as Record<string, unknown>[];
  return items[index] ?? null;
}

export const REORDERABLE_SECTION_KEYS = [
  "profiles",
  "experience",
  "education",
  "projects",
  "skills",
  "languages",
  "interests",
  "awards",
  "certifications",
  "publications",
  "volunteer",
  "references",
];

export function getSectionOrder(resumeJson: Record<string, unknown>): string[] {
  const metadata = resumeJson.metadata as Record<string, unknown> | undefined;
  const layout = metadata?.layout as Record<string, unknown> | undefined;
  const pages = layout?.pages as unknown[] | undefined;
  const firstPage = pages?.[0] as Record<string, unknown> | undefined;
  const mainSections = firstPage?.main;

  const order: string[] = [];
  if (Array.isArray(mainSections)) {
    for (const key of mainSections) {
      if (
        typeof key === "string" &&
        REORDERABLE_SECTION_KEYS.includes(key) &&
        !order.includes(key)
      ) {
        order.push(key);
      }
    }
  }

  for (const key of REORDERABLE_SECTION_KEYS) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  return order;
}

export function getOrderedDefinitions(
  resumeJson: Record<string, unknown>,
  definitions: ItemDefinition[],
): ItemDefinition[] {
  const order = getSectionOrder(resumeJson);
  const reorderableDefs = definitions.filter((d) =>
    REORDERABLE_SECTION_KEYS.includes(d.key),
  );
  reorderableDefs.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  let reorderableIndex = 0;
  return definitions.map((d) => {
    if (REORDERABLE_SECTION_KEYS.includes(d.key)) {
      return reorderableDefs[reorderableIndex++];
    }
    return d;
  });
}
