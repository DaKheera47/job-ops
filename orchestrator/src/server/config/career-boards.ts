import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workdayUrlToCxsJobsUrl } from "@career-boards/workday";
import type { WatchedSourceType, WatchlistSource } from "@shared/types";
import { z } from "zod";

const configDir = dirname(fileURLToPath(import.meta.url));
const careerBoardFilePrefix = "career-boards-";

const workdaySourceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  workdayUrl: z.string().trim().url().max(2000),
});

function buildSourceId(
  sourceType: WatchedSourceType,
  careersUrl: string,
): string {
  return `${sourceType}:${careersUrl}`;
}

function getSourceTypeFromFilename(fileName: string): WatchedSourceType | null {
  if (
    !fileName.startsWith(careerBoardFilePrefix) ||
    extname(fileName) !== ".json"
  ) {
    return null;
  }

  const sourceType = basename(fileName, ".json").slice(
    careerBoardFilePrefix.length,
  );
  return sourceType.length > 0 ? sourceType : null;
}

async function loadCareerBoardFile(
  fileName: string,
): Promise<WatchlistSource[]> {
  const sourceType = getSourceTypeFromFilename(fileName);
  if (!sourceType) return [];

  const raw = await readFile(join(configDir, fileName), "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (sourceType === "workday") {
    const entries = z.array(workdaySourceSchema).parse(parsed);
    return entries.map((entry) => ({
      id: buildSourceId(sourceType, entry.workdayUrl),
      label: entry.label,
      sourceType,
      careersUrl: entry.workdayUrl,
      cxsJobsUrl: workdayUrlToCxsJobsUrl(entry.workdayUrl),
    }));
  }

  return [];
}

export async function listCareerBoardSources(): Promise<WatchlistSource[]> {
  const files = await readdir(configDir);
  const results = await Promise.all(
    files.map((fileName) => loadCareerBoardFile(fileName)),
  );
  return results
    .flat()
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function getCareerBoardSourceById(
  id: string,
): Promise<WatchlistSource | null> {
  const sources = await listCareerBoardSources();
  return sources.find((source) => source.id === id) ?? null;
}
