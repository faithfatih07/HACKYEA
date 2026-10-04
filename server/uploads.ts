import { z } from "zod";
import type { DocumentSection } from "../src/ai/documents";
import {
  parseLabelExtraction,
  uploadedAnswerSchema,
  uploadMimeTypes,
} from "../src/uploads/schema";
import type { LabelExtraction } from "../src/uploads/schema";
import { validateFileBytes } from "../src/uploads/files";
import { groundUploadedAnswer } from "../src/uploads/documents";
export interface DocumentAIProvider {
  extractLabel(file: { mimeType: string; data: string }): Promise<unknown>;
  answerUploadedDocument(input: {
    question: string;
    sections: DocumentSection[];
  }): Promise<unknown>;
}
export async function extractLabel(
  bytes: Uint8Array,
  mimeType: string,
  provider: DocumentAIProvider | null,
): Promise<
  { provider: "gemini"; extraction: LabelExtraction } | { error: string }
> {
  validateFileBytes(bytes, mimeType);
  if (!provider) return { error: "no_key" };
  try {
    const raw = await provider.extractLabel({
      mimeType,
      data: Buffer.from(bytes).toString("base64"),
    });
    const extraction = parseLabelExtraction(raw);
    return { provider: "gemini", extraction };
  } catch {
    return { error: "extraction_failed" };
  }
}
const sectionSchema = z
  .object({
    sourceId: z.string().min(1).max(100),
    productId: z.string().min(1).max(100),
    title: z.string().max(240),
    sectionId: z.string().min(1).max(100),
    sectionTitle: z.string().max(200),
    text: z.string().min(1).max(1000),
    documentType: z.enum(["uploadedLabel", "uploadedPDF"]),
    isSyntheticDemo: z.literal(false),
    sourceLanguage: z.string().max(200).nullable().optional(),
    fileId: z.string().max(100).optional(),
    pageNumber: z.null().optional(),
  })
  .strict();
export const uploadedQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(1500),
    productId: z.string().min(1).max(100),
    sections: z.array(sectionSchema).min(1).max(6),
  })
  .strict();
export async function answerUploadedDocument(
  raw: unknown,
  provider: DocumentAIProvider | null,
) {
  const request = uploadedQuestionSchema.parse(raw);
  if (request.sections.some((s) => s.productId !== request.productId))
    throw new Error("Wrong product source");
  if (!provider) return { error: "no_key" };
  try {
    const result = await provider.answerUploadedDocument({
      question: request.question,
      sections: request.sections,
    });
    return {
      provider: "gemini",
      answer: groundUploadedAnswer(
        typeof result === "string" ? JSON.parse(result) : result,
        request.sections,
        request.question,
      ),
    };
  } catch {
    return { error: "answer_failed" };
  }
}
export { uploadedAnswerSchema, uploadMimeTypes };
