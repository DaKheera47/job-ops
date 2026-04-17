import type {
  ResumeCertificationCatalogItem,
  ResumeCertificationsSettings,
  ResumeProfile,
} from "@shared/types";

export function extractCertificationsFromProfile(profile: ResumeProfile): {
  catalog: ResumeCertificationCatalogItem[];
} {
  const items = profile?.sections?.certifications?.items;
  if (!Array.isArray(items)) return { catalog: [] };

  const catalog: ResumeCertificationCatalogItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const id = item.id || "";
    if (!id) continue;

    const title = item.title || "";
    const issuer = item.issuer || "";
    const date = item.date || "";
    const isVisibleInBase = Boolean(item.visible);

    const base: ResumeCertificationCatalogItem = {
      id,
      title,
      issuer,
      date,
      isVisibleInBase,
    };
    catalog.push(base);
  }

  return { catalog };
}

export function buildDefaultResumeCertificationsSettings(
  catalog: ResumeCertificationCatalogItem[],
): ResumeCertificationsSettings {
  const lockedCertificationIds = catalog
    .filter((c) => c.isVisibleInBase)
    .map((c) => c.id);
  const lockedSet = new Set(lockedCertificationIds);

  const aiSelectableCertificationIds = catalog
    .map((c) => c.id)
    .filter((id) => !lockedSet.has(id));

  const total = catalog.length;
  const preferredMax = Math.max(lockedCertificationIds.length, 3);
  const maxCertifications = total === 0 ? 0 : Math.min(total, preferredMax);

  return normalizeResumeCertificationsSettings(
    { maxCertifications, lockedCertificationIds, aiSelectableCertificationIds },
    new Set(catalog.map((c) => c.id)),
  );
}

export function parseResumeCertificationsSettings(
  raw: string | null,
): ResumeCertificationsSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeCertificationsSettings>;
    if (!parsed || typeof parsed !== "object") return null;
    const maxCertifications = parsed.maxCertifications;
    const lockedCertificationIds = parsed.lockedCertificationIds;
    const aiSelectableCertificationIds = parsed.aiSelectableCertificationIds;

    if (typeof maxCertifications !== "number") return null;
    if (
      !Array.isArray(lockedCertificationIds) ||
      !Array.isArray(aiSelectableCertificationIds)
    )
      return null;
    if (!lockedCertificationIds.every((v: unknown) => typeof v === "string"))
      return null;
    if (!aiSelectableCertificationIds.every((v: unknown) => typeof v === "string"))
      return null;

    return {
      maxCertifications,
      lockedCertificationIds,
      aiSelectableCertificationIds,
    };
  } catch {
    return null;
  }
}

export function normalizeResumeCertificationsSettings(
  settings: ResumeCertificationsSettings,
  allowedCertificationIds?: ReadonlySet<string>,
): ResumeCertificationsSettings {
  const allowed =
    allowedCertificationIds && allowedCertificationIds.size > 0
      ? allowedCertificationIds
      : null;

  const lockedCertificationIds = uniqueStrings(
    settings.lockedCertificationIds,
  ).filter((id) => (allowed ? allowed.has(id) : true));
  const lockedSet = new Set(lockedCertificationIds);

  const aiSelectableCertificationIds = uniqueStrings(
    settings.aiSelectableCertificationIds,
  )
    .filter((id) => (allowed ? allowed.has(id) : true))
    .filter((id) => !lockedSet.has(id));

  const maxCap = allowed ? allowed.size : Number.POSITIVE_INFINITY;
  const maxCertificationsRaw = Number.isFinite(settings.maxCertifications)
    ? settings.maxCertifications
    : 0;
  const maxCertificationsInt = Math.max(0, Math.floor(maxCertificationsRaw));
  const minRequired = lockedCertificationIds.length;
  const maxCertifications = Math.min(
    maxCap,
    Math.max(minRequired, maxCertificationsInt),
  );

  return { maxCertifications, lockedCertificationIds, aiSelectableCertificationIds };
}

export function resolveResumeCertificationsSettings(args: {
  catalog: ResumeCertificationCatalogItem[];
  overrideRaw: string | null;
}): {
  profileCertifications: ResumeCertificationCatalogItem[];
  defaultResumeCertifications: ResumeCertificationsSettings;
  overrideResumeCertifications: ResumeCertificationsSettings | null;
  resumeCertifications: ResumeCertificationsSettings;
} {
  const profileCertifications = args.catalog;
  const allowed = new Set(profileCertifications.map((c) => c.id));
  const defaultResumeCertifications =
    buildDefaultResumeCertificationsSettings(profileCertifications);
  const overrideParsed = parseResumeCertificationsSettings(args.overrideRaw);
  const overrideResumeCertifications = overrideParsed
    ? normalizeResumeCertificationsSettings(overrideParsed, allowed)
    : null;

  const resumeCertifications = overrideResumeCertifications
    ? normalizeResumeCertificationsSettings(overrideResumeCertifications, allowed)
    : defaultResumeCertifications;

  return {
    profileCertifications,
    defaultResumeCertifications,
    overrideResumeCertifications,
    resumeCertifications,
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
