import { parseLabelExtraction } from "./schema";
import { validateFileMetadata, validateFileBytes } from "./files";
import { groundUploadedAnswer } from "./documents";
import type { DocumentSection } from "../ai/documents";
export async function requestLabelExtraction(file: File, signal?: AbortSignal) {
  const mime = validateFileMetadata(file);
  validateFileBytes(new Uint8Array(await file.arrayBuffer()), mime);
  const response = await fetch("/api/label-extract", {
    method: "POST",
    headers: { "Content-Type": mime },
    body: file,
    signal: signal ?? AbortSignal.timeout(75000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 413
        ? "The file exceeds the 10 MB limit."
        : "The upload could not be processed. Try again or enter details manually.",
    );
  const value = await response.json();
  if (value.error)
    throw new Error(
      value.error === "no_key"
        ? "Gemini is not configured on the server. Enter details manually or configure the server key."
        : "AI extraction failed. Try a clearer photo or enter details manually.",
    );
  if (value.provider !== "gemini")
    throw new Error("No real extraction was returned. Use manual entry.");
  return parseLabelExtraction(value.extraction);
}
export async function requestUploadedAnswer(
  question: string,
  productId: string,
  sections: DocumentSection[],
) {
  const response = await fetch("/api/document-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, productId, sections }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      "Document Q&A is unavailable. The source text is still accessible.",
    );
  const value = await response.json();
  if (value.provider !== "gemini")
    throw new Error(
      value.error === "no_key"
        ? "Gemini is not configured. Open the source text or try again after configuring the server key."
        : "The document answer could not be verified. No answer was invented.",
    );
  return groundUploadedAnswer(value.answer, sections, question);
}
