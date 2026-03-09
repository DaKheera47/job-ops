type ResumeArtifact = {
  href: string;
  extension: string;
  label: "PDF" | "TEX";
  isPdf: boolean;
};

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function getResumeArtifact(args: {
  storedPath: string | null | undefined;
  updatedAt: string;
}): ResumeArtifact | null {
  if (!args.storedPath) return null;
  const normalized = toPosixPath(args.storedPath);
  const marker = "/pdfs/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const relativePath = normalized.slice(markerIndex + marker.length);
  const extension = relativePath.toLowerCase().endsWith(".tex") ? "tex" : "pdf";
  const href = `/pdfs/${relativePath}?v=${encodeURIComponent(args.updatedAt)}`;

  return {
    href,
    extension,
    label: extension === "pdf" ? "PDF" : "TEX",
    isPdf: extension === "pdf",
  };
}
