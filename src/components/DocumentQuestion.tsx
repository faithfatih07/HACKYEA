import { useState } from "react";
import { t, useLanguage } from "../i18n";
import type { FarmState } from "../domain/types";
import { requestInterpretation } from "../ai/client";
import {
  groundDocumentAnswer,
  localDocumentInterpretation,
} from "../ai/answers";
import type { GroundedAnswer } from "../ai/answers";
import type { DocumentSection } from "../ai/documents";
import type { DocumentInterpretation } from "../ai/schema";

export function SourceCards({ sections }: { sections: DocumentSection[] }) {
  return (
    <div className="source-cards">
      {sections.map((section) => (
        <details
          className="source-card"
          key={`${section.sourceId}/${section.sectionId}`}
        >
          <summary>
            {t("showSource")} · {section.sectionTitle}
          </summary>
          <strong>{section.title}</strong>
          <small>
            {section.sourceId} / {section.sectionId} · {t("syntheticDocument")}
          </small>
          <p>{section.text}</p>
        </details>
      ))}
    </div>
  );
}

export function DocumentQuestion({
  state,
  productId = null,
  initialQuestion = "",
  initialResult,
  initialProvider = "demo",
  onProvider,
}: {
  state: FarmState;
  productId?: string | null;
  initialQuestion?: string;
  initialResult?: DocumentInterpretation;
  initialProvider?: "demo" | "gemini";
  onProvider?: (provider: "demo" | "gemini") => void;
}) {
  const language = useLanguage();
  const [question, setQuestion] = useState(initialQuestion);
  const [applicationDate, setApplicationDate] = useState("");
  const [provider, setProvider] = useState(initialProvider);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    question: string;
    interpretation: DocumentInterpretation;
    applicationDateTime: string | null;
  } | null>(
    initialResult
      ? {
          question: initialQuestion,
          interpretation: initialResult,
          applicationDateTime: null,
        }
      : null,
  );
  let answer: GroundedAnswer | null = null;
  if (result) {
    try {
      answer = groundDocumentAnswer(
        result.question,
        result.interpretation,
        productId,
        result.applicationDateTime,
        language,
      );
    } catch {
      /* Invalid claims never become answers. */
    }
  }
  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setNotice("");
    setResult(null);
    try {
      const applicationDateTime = applicationDate
        ? new Date(applicationDate).toISOString()
        : null;
      // Null product means let deterministic retrieval request/resolve an explicit product.
      const response = await requestInterpretation(question, state, language, {
        productId,
        applicationDateTime,
      });
      const interpretation =
        response.provider === "gemini" &&
        response.result.mode === "DOCUMENT_ANSWER"
          ? response.result
          : localDocumentInterpretation(question, productId);
      groundDocumentAnswer(
        question,
        interpretation,
        productId,
        applicationDateTime,
        language,
      );
      const activeProvider = response.provider === "gemini" ? "gemini" : "demo";
      setProvider(activeProvider);
      onProvider?.(activeProvider);
      if (response.provider === "demo" && response.reason !== "no_key")
        setNotice(t("aiFallbackNotice"));
      setResult({ question, interpretation, applicationDateTime });
    } catch {
      setNotice(t("aiInvalidNotice"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="document-question panel" aria-label={t("askDocument")}>
      <h3>{t("askDocument")}</h3>
      <p>{t("documentScope")}</p>
      <label>
        {t("documentQuestionLabel")}
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t(
            productId === "product-pesticide-b"
              ? "pesticideQuestionExample"
              : "documentQuestionExample",
          )}
        />
      </label>
      {(answer?.needsApplicationDate || applicationDate) && (
        <label>
          {t("applicationDateTime")}
          <input
            type="datetime-local"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
          />
        </label>
      )}
      <button
        className="button dark full"
        disabled={busy || !question.trim()}
        aria-busy={busy}
        onClick={ask}
      >
        {busy && <span className="ai-wait-mark" aria-hidden="true" />}
        {t(busy ? "aiLoading" : "askDocument")}
      </button>
      <small className="interpreter-label">
        {t(provider === "gemini" ? "geminiLabel" : "interpreterLabel")}
      </small>
      {notice && (
        <p className="error-message" role="status">
          {notice}
        </p>
      )}
      {answer && (
        <div className="document-answer" role="status">
          <span className="pill">
            {t(answer.unavailable ? "informationMissing" : "verifiedDocument")}
          </span>
          <p>{t(answer.messageKey, answer.values)}</p>
          <p className="fine-print">{t("syntheticDisclaimer")}</p>
          {provider === "demo" && <small>{t("localSourceLookup")}</small>}
          <SourceCards sections={answer.sections} />
        </div>
      )}
    </section>
  );
}
