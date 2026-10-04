import type { LabelFields, UploadMime } from "./schema";
import type { DocumentSection } from "../ai/documents";
export type ProductDocumentDraft = {
  id: string;
  farmId: string;
  actorId: string;
  kind: "importProductDocument";
  productId: string; // Application-generated or explicitly selected existing ID.
  existingProductId: string | null;
  sourceId: string;
  fileId: string;
  fileName: string;
  mimeType: UploadMime;
  fileSize: number;
  fields: LabelFields;
  sourceText: string;
  sourceLanguage: string | null;
  extractionMethod: "gemini" | "manual";
  scannedCode?: string | null;
  ownedStock: null | {
    mode: "packages" | "total";
    quantity: number;
    unit: "kg" | "g" | "l" | "ml" | "unknown";
    storageLocationId: string;
  };
};
export type UploadedDocument = {
  fileId: string;
  fileName: string;
  mimeType: UploadMime;
  fileSize: number;
  extractionMethod: "gemini" | "manual";
  sourceLanguage: string | null;
  reviewedFields: LabelFields;
  sections: DocumentSection[];
};
