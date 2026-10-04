import { documentTopic, retrieveSections } from "./documents";
import type { DocumentSection } from "./documents";
import { documentAnswerSchema } from "./schema";
import type { DocumentInterpretation } from "./schema";
import type { Language } from "../i18n/messages";

export type GroundedAnswer = {
  messageKey:
    | "answerPackaging"
    | "answerHarvest"
    | "answerHarvestDate"
    | "answerUnavailable"
    | "answerProductMissing";
  values: Record<string, string>;
  sections: DocumentSection[];
  unavailable: boolean;
  needsApplicationDate: boolean;
  synthetic: boolean;
};
export function localDocumentInterpretation(
  question: string,
  productId?: string | null,
): DocumentInterpretation {
  const sections = retrieveSections(question, productId);
  const topic = documentTopic(question);
  return {
    mode: "DOCUMENT_ANSWER",
    answerType: topic,
    sourceRefs: sections.map((s) => ({
      sourceId: s.sourceId,
      sectionId: s.sectionId,
    })),
    missingFields: [],
  };
}
// Answers use verified fixture facts, not unchecked model prose or arithmetic.
// Unknown source IDs, unrelated sections and mismatched fact claims are rejected.
export function groundDocumentAnswer(
  question: string,
  result: DocumentInterpretation,
  productId: string | null,
  applicationDateTime: string | null,
  _language: Language,
): GroundedAnswer {
  const value = documentAnswerSchema.parse(result);
  const retrieved = retrieveSections(question, productId);
  const sections = value.sourceRefs.map((ref) => {
    const section = retrieved.find(
      (s) => s.sourceId === ref.sourceId && s.sectionId === ref.sectionId,
    );
    if (!section) throw new Error("Unverified document reference");
    return section;
  });
  const base = {
    values: {},
    sections,
    unavailable: false,
    needsApplicationDate: false,
    synthetic: true,
  };
  if (!retrieved.length)
    return { ...base, messageKey: "answerProductMissing", unavailable: true };
  const expected = documentTopic(question);
  if (value.answerType !== expected)
    throw new Error("Unsupported document claim");
  if (
    expected === "packaging" &&
    sections.some(
      (s) => s.sourceId === "doc-fertilizer-a" && s.sectionId === "packaging",
    )
  )
    return { ...base, messageKey: "answerPackaging" };
  if (
    expected === "harvestWait" &&
    sections.some(
      (s) => s.sourceId === "doc-pesticide-b" && s.sectionId === "harvest-wait",
    )
  ) {
    if (!applicationDateTime)
      return {
        ...base,
        messageKey: "answerHarvestDate",
        needsApplicationDate: true,
      };
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(
        applicationDateTime,
      ) ||
      !Number.isFinite(Date.parse(applicationDateTime))
    )
      throw new Error("Invalid application date");
    const earliest = new Date(
      Date.parse(applicationDateTime) + 10 * 24 * 60 * 60 * 1000,
    );
    return {
      ...base,
      messageKey: "answerHarvest",
      values: {
        date: earliest.toLocaleString("en-GB"),
      },
    };
  }
  return { ...base, messageKey: "answerUnavailable", unavailable: true };
}
