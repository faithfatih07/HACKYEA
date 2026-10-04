import { z } from "zod";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const uploadMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;
export type UploadMime = (typeof uploadMimeTypes)[number];
const nullableText = z.string().trim().min(1).max(200).nullable();
export const labelFieldsSchema = z
  .object({
    productName: nullableText,
    manufacturer: nullableText,
    category: z.enum(["fertilizer", "pesticide", "unknown"]),
    packageQuantity: z.number().finite().positive().max(1_000_000).nullable(),
    packageUnit: z.enum(["kg", "g", "l", "ml", "unknown"]),
    barcode: nullableText,
    batch: nullableText,
    expiryDate: nullableText,
  })
  .strict();
// Recognise explicit supported unit spellings; never convert a different unit by guesswork.
const unitWords = {
  kg: /\b(?:kg|kilos?|kilograms?|kilogrammes?)\b/i,
  g: /\b(?:g|grams?|grammes?)\b/i,
  l: /\b(?:l|liters?|litres?)\b/i,
  ml: /\b(?:ml|milliliters?|millilitres?)\b/i,
};
export function hasExplicitUnit(text: string, unit: string) {
  return (
    unit in unitWords && unitWords[unit as keyof typeof unitWords].test(text)
  );
}
export type LabelFields = z.infer<typeof labelFieldsSchema>;
export const labelExtractionSchema = labelFieldsSchema
  .extend({
    readability: z.enum(["readable", "unreadable", "multipleProducts"]),
    sourceLanguage: nullableText,
    sourceText: z.string().max(24000),
    evidence: z
      .array(
        z
          .object({
            field: z.enum([
              "productName",
              "manufacturer",
              "category",
              "packageQuantity",
              "packageUnit",
              "barcode",
              "batch",
              "expiryDate",
            ]),
            quote: z.string().min(1).max(800),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;
export function parseLabelExtraction(raw: unknown): LabelExtraction {
  const value = labelExtractionSchema.parse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  );
  if (value.readability !== "readable") return value;
  if (!value.sourceText.trim()) throw new Error("Missing readable source text");
  for (const [field, result] of Object.entries(value)) {
    if (
      !(field in labelFieldsSchema.shape) ||
      result === null ||
      result === "unknown"
    )
      continue;
    const evidence = value.evidence.find(
      (e) => e.field === field && value.sourceText.includes(e.quote),
    );
    if (!evidence) throw new Error("Missing extraction evidence");
    if (
      [
        "productName",
        "manufacturer",
        "barcode",
        "batch",
        "expiryDate",
      ].includes(field) &&
      !evidence.quote.toLowerCase().includes(String(result).toLowerCase())
    )
      throw new Error("Field not present in evidence");
    if (
      field === "packageUnit" &&
      !hasExplicitUnit(evidence.quote, String(result))
    )
      throw new Error("Package unit not present in evidence");
    if (
      field === "packageQuantity" &&
      !(evidence.quote.match(/\d+(?:[.,]\d+)?/g) ?? []).some(
        (n) => Number(n.replace(",", ".")) === result,
      )
    )
      throw new Error("Package amount not present in evidence");
  }
  if (value.evidence.some((e) => !value.sourceText.includes(e.quote)))
    throw new Error("Invalid source quote");
  return value;
}
export const uploadedClaimSchema = z
  .object({
    answer: z.string().min(1).max(1200),
    sourceId: z.string().min(1).max(100),
    sectionId: z.string().min(1).max(100),
    quote: z.string().min(1).max(1500),
    translation: z.boolean(),
  })
  .strict();
export const uploadedAnswerSchema = z
  .object({
    found: z.boolean(),
    claims: z.array(uploadedClaimSchema).max(5),
  })
  .strict();
export type UploadedAnswer = z.infer<typeof uploadedAnswerSchema>;
