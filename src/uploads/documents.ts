import type { FarmState } from "../domain/types";
import { documentSections, normalize } from "../ai/documents";
import type { DocumentSection } from "../ai/documents";
import { hasExplicitUnit, uploadedAnswerSchema } from "./schema";
import type { UploadedAnswer } from "./schema";

export function splitSourceText(
  text: string,
  sourceId: string,
  productId: string,
  title: string,
  fileId: string,
  pdf: boolean,
  sourceLanguage: string | null,
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  // Preserve transcription verbatim. Model-proposed page numbers are deliberately not stored.
  for (let offset = 0; offset < text.length; offset += 1000) {
    const content = text.slice(offset, offset + 1000);
    if (!content.trim()) continue;
    const number = sections.length + 1;
    sections.push({
      sourceId,
      productId,
      title,
      fileId,
      sourceLanguage,
      sectionId: `section-${number}`,
      sectionTitle: `Source section ${number}`,
      text: content,
      documentType: pdf ? "uploadedPDF" : "uploadedLabel",
      isSyntheticDemo: false,
      pageNumber: null,
    });
  }
  return sections;
}
export function uploadedSections(state: FarmState, productId: string | null) {
  return state.documentSources
    .filter(
      (d) => d.productId === productId && d.verification === "userProvided",
    )
    .flatMap((d) => d.uploaded?.sections ?? []);
}
export function productSections(state: FarmState, productId: string) {
  return [
    ...documentSections.filter((s) => s.productId === productId),
    ...uploadedSections(state, productId),
  ];
}
export function retrieveUploadedSections(
  question: string,
  sections: DocumentSection[],
): DocumentSection[] {
  const q = normalize(question);
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["the", "this", "what", "how", "should", "many", "product"].includes(
          w,
        ),
    );
  if (/bag|packag|weight|net|size/.test(q))
    tokens.push("package", "packaging", "kg", "weight", "ambalaj", "agirlik");
  if (/dose|rate|apply|decare/.test(q))
    tokens.push("dose", "application", "rate", "doz", "uygulama");
  return sections
    .map((s, i) => ({
      s,
      i,
      score: tokens.reduce(
        (n, t) => n + (normalize(s.text).includes(t) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 6)
    .map((x) => x.s);
}
export function groundUploadedAnswer(
  raw: unknown,
  sections: DocumentSection[],
  question = "",
): UploadedAnswer {
  const value = uploadedAnswerSchema.parse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  );
  if (!value.found && value.claims.length)
    throw new Error("Claims contradict missing information");
  if (value.found && !value.claims.length)
    throw new Error("Answer needs supporting source text");
  for (const claim of value.claims) {
    const source = sections.find(
      (s) => s.sourceId === claim.sourceId && s.sectionId === claim.sectionId,
    );
    if (!source || !source.text.includes(claim.quote))
      throw new Error("Unverified source quote");
    // Reject new numeric quantities, times or rates not present in the quoted text.
    const numbers = claim.answer.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const quotedNumbers = new Set(
      (claim.quote.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
        n.replaceAll(",", "."),
      ),
    );
    if (numbers.some((n) => !quotedNumbers.has(n.replaceAll(",", "."))))
      throw new Error("Unsupported numeric claim");
    for (const unit of ["kg", "g", "l", "ml"]) {
      if (
        hasExplicitUnit(claim.answer, unit) &&
        !hasExplicitUnit(claim.quote, unit)
      )
        throw new Error("Unsupported unit in answer");
    }
    if (
      /dose|rate|per decare|per hectare/.test(normalize(question)) &&
      !/dose|rate|application|doz|uygulama/.test(normalize(claim.quote))
    )
      throw new Error("Package weight is not a dose");
  }
  return value;
}
