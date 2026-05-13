import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const themesDir = join(
  repoRoot,
  "orchestrator/src/server/services/resume-renderer/typst-themes",
);
const outputPath = join(repoRoot, "shared/src/generated/typst-themes.ts");
const checkOnly = process.argv.includes("--check");

const REQUIRED_NATIVE_TOKEN_KEYS = [
  "pageMargin",
  "bodySize",
  "parLeading",
  "sectionTop",
  "sectionBottom",
  "sectionSize",
  "lineWidth",
  "nameSize",
  "headlineSize",
  "contactSize",
  "entryMetaSize",
  "accent",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSafeThemePath(themeDirName, value, field) {
  const normalized = normalize(value);
  assert(
    !(
      normalized.startsWith("..") ||
      normalized.includes("/../") ||
      normalized.includes("\\..\\") ||
      normalized.startsWith("/") ||
      /^[a-zA-Z]:/.test(normalized)
    ),
    `${themeDirName}/theme.json ${field} must stay inside its theme directory`,
  );
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readThemeManifest(themeDirName) {
  const manifestPath = join(themesDir, themeDirName, "theme.json");
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  assert(
    isPlainObject(manifest),
    `${themeDirName}/theme.json must be an object`,
  );
  assert(
    typeof manifest.id === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id),
    `${themeDirName}/theme.json id must be kebab-case`,
  );
  assert(
    manifest.id === themeDirName,
    `${themeDirName}/theme.json id must match its directory name`,
  );
  assert(
    typeof manifest.label === "string" && manifest.label.trim().length > 0,
    `${themeDirName}/theme.json label is required`,
  );
  assert(
    typeof manifest.description === "string" &&
      manifest.description.trim().length > 0,
    `${themeDirName}/theme.json description is required`,
  );
  assert(
    manifest.kind === "native" || manifest.kind === "adapted",
    `${themeDirName}/theme.json kind must be "native" or "adapted"`,
  );
  assert(
    typeof manifest.entrypoint === "string" &&
      manifest.entrypoint.trim().length > 0,
    `${themeDirName}/theme.json entrypoint is required`,
  );
  assertSafeThemePath(themeDirName, manifest.entrypoint, "entrypoint");
  assert(
    await pathExists(join(themesDir, themeDirName, manifest.entrypoint)),
    `${themeDirName}/${manifest.entrypoint} does not exist`,
  );

  if (manifest.kind === "native") {
    assert(
      isPlainObject(manifest.tokens),
      `${themeDirName}/theme.json native themes require tokens`,
    );
    for (const key of REQUIRED_NATIVE_TOKEN_KEYS) {
      assert(
        typeof manifest.tokens[key] === "string" &&
          manifest.tokens[key].trim().length > 0,
        `${themeDirName}/theme.json tokens.${key} is required`,
      );
    }
  }

  return {
    id: manifest.id,
    label: manifest.label,
    description: manifest.description,
    kind: manifest.kind,
    entrypoint: manifest.entrypoint,
  };
}

async function readThemeManifests() {
  const entries = await readdir(themesDir, { withFileTypes: true });
  const themeDirNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert(themeDirNames.length > 0, "No Typst theme directories found");

  const manifests = [];
  const ids = new Set();
  for (const themeDirName of themeDirNames) {
    const manifest = await readThemeManifest(themeDirName);
    assert(!ids.has(manifest.id), `Duplicate Typst theme id: ${manifest.id}`);
    ids.add(manifest.id);
    manifests.push(manifest);
  }
  return manifests;
}

function buildGeneratedSource(manifests) {
  const values = manifests.map((manifest) => manifest.id);
  const labels = Object.fromEntries(
    manifests.map((manifest) => [manifest.id, manifest.label]),
  );
  const descriptions = Object.fromEntries(
    manifests.map((manifest) => [manifest.id, manifest.description]),
  );
  const kinds = Object.fromEntries(
    manifests.map((manifest) => [manifest.id, manifest.kind]),
  );
  const formatArray = (items) =>
    `[\n${items.map((item) => `  ${JSON.stringify(item)},`).join("\n")}\n]`;
  const formatKey = (key) =>
    /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
  const formatRecord = (record) => {
    const entries = Object.entries(record)
      .map(([key, value]) => {
        const keyText = formatKey(key);
        const valueText = JSON.stringify(value);
        const line = `  ${keyText}: ${valueText},`;
        return line.length > 80 ? `  ${keyText}:\n    ${valueText},` : line;
      })
      .join("\n");
    return `{\n${entries}\n}`;
  };

  return `// Generated by ${relative(repoRoot, fileURLToPath(import.meta.url))}. Do not edit by hand.

export const TYPST_THEME_VALUES = ${formatArray(values)} as const;

export type GeneratedTypstTheme = (typeof TYPST_THEME_VALUES)[number];

export const TYPST_THEME_LABELS: Record<GeneratedTypstTheme, string> = ${formatRecord(labels)};

export const TYPST_THEME_DESCRIPTIONS: Record<GeneratedTypstTheme, string> = ${formatRecord(descriptions)};

export const TYPST_THEME_KINDS: Record<
  GeneratedTypstTheme,
  "native" | "adapted"
> = ${formatRecord(kinds)};

export const TYPST_THEME_OPTIONS = TYPST_THEME_VALUES.map((value) => ({
  value,
  label: TYPST_THEME_LABELS[value],
  description: TYPST_THEME_DESCRIPTIONS[value],
  kind: TYPST_THEME_KINDS[value],
}));
`;
}

const manifests = await readThemeManifests();
const generated = buildGeneratedSource(manifests);

if (checkOnly) {
  const current = await readFile(outputPath, "utf8").catch(() => null);
  if (current !== generated) {
    throw new Error(
      `${relative(repoRoot, outputPath)} is stale. Run npm run typst-theme:generate.`,
    );
  }
  console.log(`Validated ${manifests.length} Typst theme manifests.`);
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log(
    `Generated ${relative(repoRoot, outputPath)} from ${manifests.length} Typst themes.`,
  );
}
