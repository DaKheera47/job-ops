import { copyFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { getDesignResumeAssetById } from "@server/repositories/design-resume";
import type { LatexResumeDocument } from "./types";

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".jpg";
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = extname(pathname).trim();
    return extension || ".jpg";
  } catch {
    return ".jpg";
  }
}

export async function materializeResumePicture(
  document: LatexResumeDocument,
  outputDir: string,
): Promise<LatexResumeDocument> {
  const picture = document.picture;
  if (!picture || picture.hidden || !picture.url) {
    return document;
  }

  if (picture.assetId) {
    const asset = await getDesignResumeAssetById(picture.assetId);
    if (!asset?.storagePath) {
      return document;
    }

    const destination = join(
      outputDir,
      `resume-picture${extname(asset.originalName || asset.storagePath) || ".img"}`,
    );
    await copyFile(asset.storagePath, destination);
    return {
      ...document,
      picture: {
        ...picture,
        renderPath: destination,
      },
    };
  }

  if (!/^https?:\/\//i.test(picture.url)) {
    return document;
  }

  const response = await fetch(picture.url);
  if (!response.ok) {
    throw new Error(
      `Resume picture download failed with HTTP ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const extension = mimeType
    ? extensionForMimeType(mimeType)
    : extensionFromUrl(picture.url);
  const destination = join(outputDir, `resume-picture${extension}`);
  await writeFile(destination, bytes);
  return {
    ...document,
    picture: {
      ...picture,
      renderPath: destination,
    },
  };
}
