import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

let cachedDir: string | null = null;

export function getDataDir(): string {
  const fromEnv = (process.env.DATA_DIR || "").trim();
  if (fromEnv) return fromEnv;

  if (cachedDir) return cachedDir;

  const cwd = process.cwd();
  const cwdBase = basename(cwd);
  const parentDir = join(cwd, "..");
  const parentLooksLikeRoot = [
    join(parentDir, "docker-compose.yml"),
    join(parentDir, "Dockerfile"),
    join(parentDir, ".env"),
  ].some((marker) => existsSync(marker));
  const candidates =
    cwdBase === "orchestrator" && parentLooksLikeRoot
      ? [join(parentDir, "data"), join(cwd, "data")]
      : [join(cwd, "data"), join(parentDir, "data")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedDir = resolve(candidate);
      return cachedDir;
    }
  }

  cachedDir = resolve(join(cwd, "data"));
  return cachedDir;
}
