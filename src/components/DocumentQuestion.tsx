import { useEffect, useRef, useState } from "react";
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

import { OriginalDocument } from "./OriginalDocument";
import {
  uploadedSections,
  retrieveUploadedSections,
} from "../uploads/documents";
import { requestUploadedAnswer } from "../uploads/client";
import type { UploadedAnswer } from "../uploads/schema";
import { normalize } from "../ai/documents";

function SourceCard({ section }: { section: DocumentSection }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="source-card"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {t("showSource")} · {section.sectionTitle}
        {!section.isSyntheticDemo && ` · ${section.title}`}
      </summary>
      <strong>{section.title}</strong>
      <small>
        {section.sourceId} / {section.sectionId} ·{" "}
        {t(section.isSyntheticDemo ? "syntheticDocument" : "uploadSourceBadge")}
      </small>
      <p style={{ whiteSpace: "pre-wrap" }}>{section.text}</p>
      {open && !section.isSyntheticDemo && section.fileId && (
        <OriginalDocument
          fileId={section.fileId}
          name={section.title}
          mimeType={
            section.documentType === "uploadedPDF"
              ? "application/pdf"
              : "image/jpeg"
          }
        />
      )}
    </details>
  );
}
export function SourceCards({ sections }: { sections: DocumentSection[] }) {
  return (
    <div className="source-cards">
      {sections.map((section) => (
        <SourceCard
          key={`${section.sourceId}/${section.sectionId}`}
          section={section}
        />
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
  autoAsk = false,
}: {
  autoAsk?: boolean;
  state: FarmState;
  productId?: string | null;
  initialQuestion?: string;
  initialResult?: DocumentInterpretation;
  initialProvider?: "demo" | "gemini";
  onProvider?: (provider: "demo" | "gemini") => void;
}) {
  const language = useLanguage();
  const [question, setQuestion] = useState(initialQuestion);
  const namedProducts = state.products.filter((p) =>
    normalize(question).includes(normalize(p.name)),
  );
  const selectedProductId =
    productId ?? (namedProducts.length === 1 ? namedProducts[0].id : null);
  const hasUploads = state.documentSources.some(
    (s) =>
      s.productId === selectedProductId && s.verification === "userProvided",
  );
  const [uploadedResult, setUploadedResult] = useState<{
    answer: UploadedAnswer;
    sections: DocumentSection[];
  } | null>(null);
  const autoStarted = useRef(false);
  const [applicationDate, setApplicationDate] = useState("");
  const [provider, setProvider] = useState(initialProvider);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    question: string;
    interpretation: DocumentInterpretation;
    applicationDateTime: string | null;
  } | null>(
    initialResult && !hasUploads
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
    setUploadedResult(null);
    try {
      if (hasUploads && selectedProductId) {
        const sections = retrieveUploadedSections(
          question,
          uploadedSections(state, selectedProductId),
        );
        if (!sections.length) {
          setNotice(t("uploadNoSourceText"));
          return;
        }
        const answer = await requestUploadedAnswer(
          question,
          selectedProductId,
          sections,
        );
        setUploadedResult({ answer, sections });
        setProvider("gemini");
        onProvider?.("gemini");
        return;
      }
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
    } catch (error) {
      setNotice(
        hasUploads && error instanceof Error
          ? error.message
          : t("aiInvalidNotice"),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (autoAsk && !autoStarted.current && initialQuestion) {
      autoStarted.current = true;
      void ask();
    }
  }, [autoAsk, initialQuestion]);
  const usedSections =
    uploadedResult?.sections.filter((s) =>
      uploadedResult.answer.claims.some(
        (c) => c.sourceId === s.sourceId && c.sectionId === s.sectionId,
      ),
    ) ?? [];
  return (
    <section className="document-question panel" aria-label={t("askDocument")}>
      <h3>{t("askDocument")}</h3>
      <p>{t(hasUploads ? "uploadQAScope" : "documentScope")}</p>
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
        {t(
          busy ? (hasUploads ? "uploadQALoading" : "aiLoading") : "askDocument",
        )}
      </button>
      <small className="interpreter-label">
        {t(
          hasUploads && !uploadedResult
            ? "uploadQAIdle"
            : provider === "gemini"
              ? "geminiLabel"
              : "interpreterLabel",
        )}
      </small>
      {notice && (
        <p className="error-message" role="status">
          {notice}
        </p>
      )}
      {uploadedResult && (
        <div className="document-answer" role="status">
          <span className="pill">{t("uploadSourceAnswer")}</span>
          <p className="fine-print">{t("uploadSourceTrust")}</p>
          {!uploadedResult.answer.found && <p>{t("uploadAnswerMissing")}</p>}
          {uploadedResult.answer.claims.map((claim, i) => (
            <div key={i}>
              <p>{claim.answer}</p>
              {(claim.translation ||
                uploadedResult.sections.some(
                  (s) =>
                    s.sourceId === claim.sourceId &&
                    s.sectionId === claim.sectionId &&
                    s.sourceLanguage &&
                    !/^en(?:glish)?$/i.test(s.sourceLanguage),
                )) && <small>{t("uploadAnswerTranslation")}</small>}
              <blockquote style={{ whiteSpace: "pre-wrap" }}>
                {claim.quote}
              </blockquote>
            </div>
          ))}
          <SourceCards
            sections={
              uploadedResult.answer.found
                ? usedSections
                : uploadedResult.sections
            }
          />
        </div>
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
