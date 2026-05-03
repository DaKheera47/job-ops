export function getFullViewerUrl(viewerPath: string): string {
  const base = (
    process.env.JOBOPS_PUBLIC_BASE_URL || "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${base}${viewerPath}`;
}
