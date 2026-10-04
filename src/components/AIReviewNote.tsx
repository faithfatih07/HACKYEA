import { t } from "../i18n";
import { SourceCards } from "./DocumentQuestion";
import { documentSections } from "../ai/documents";

export type AIReviewMetadata = {
  summary: string;
  questions: string[];
  bagConversion: {
    count: number;
    kg: number;
    sourceId: string;
    sectionId: string;
  } | null;
};
export function AIReviewNote({
  metadata,
  acknowledged,
  onAcknowledge,
}: {
  metadata: AIReviewMetadata;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <section className="ai-review-note">
      <span className="pill">{t("aiInterpreted")}</span>
      <p>{metadata.summary}</p>
      {metadata.bagConversion && (
        <>
          <p>
            {t("bagConversion", {
              count: metadata.bagConversion.count,
              kg: metadata.bagConversion.kg,
              total: metadata.bagConversion.count * metadata.bagConversion.kg,
            })}
          </p>
          <SourceCards
            sections={documentSections.filter(
              (s) =>
                s.sourceId === metadata.bagConversion?.sourceId &&
                s.sectionId === metadata.bagConversion?.sectionId,
            )}
          />
        </>
      )}
      {metadata.questions.length > 0 && (
        <>
          <strong>{t("informationMissing")}</strong>
          <p>{t("resolveQuestions")}</p>
          <ul>
            {metadata.questions.map((question, i) => (
              <li key={i}>
                {question === "bagSize"
                  ? t("bagSizeQuestion")
                  : question === "quantityUnit" || question === "actualQuantity"
                    ? t("quantityUnitQuestion")
                    : question === "startTime"
                      ? t("startTime")
                      : question === "endTime"
                        ? t("endTime")
                        : question}
              </li>
            ))}
          </ul>
          <label className="ai-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => onAcknowledge(e.target.checked)}
            />
            {t("questionsResolved")}
          </label>
        </>
      )}
      <small>
        {t("recordsCalculated")}. {t("unchangedUntilApproval")}
      </small>
    </section>
  );
}
