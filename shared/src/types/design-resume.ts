import type { RxResumeMode } from "./settings";

export type ReactiveResumeV5Document = Record<string, unknown>;

export type DesignResumeJson = ReactiveResumeV5Document;

export interface DesignResumeAsset {
  id: string;
  documentId: string;
  kind: "picture";
  originalName: string;
  mimeType: string;
  byteSize: number;
  storagePath: string;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignResumeDocument {
  id: string;
  title: string;
  resumeJson: DesignResumeJson;
  revision: number;
  sourceResumeId: string | null;
  sourceMode: RxResumeMode | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assets: DesignResumeAsset[];
}

export interface DesignResumeStatusResponse {
  exists: boolean;
  documentId: string | null;
  updatedAt: string | null;
}

export interface DesignResumeImportResult {
  document: DesignResumeDocument;
}

export interface DesignResumePatchRequest {
  baseRevision: number;
  document?: DesignResumeJson;
  operations?: Array<{
    op: "add" | "remove" | "replace" | "move" | "copy" | "test";
    path: string;
    from?: string;
    value?: unknown;
  }>;
}

export interface DesignResumeExportResponse {
  fileName: string;
  document: DesignResumeJson;
}

export interface DesignResumePdfResponse {
  fileName: string;
  pdfUrl: string;
  generatedAt: string;
}
