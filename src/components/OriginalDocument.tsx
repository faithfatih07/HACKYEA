import { useEffect, useState } from "react";
import { getFarmRepository } from "../domain/browserRepository";
import { t } from "../i18n";

export function OriginalDocument({
  file,
  fileId,
  name,
  mimeType,
}: {
  file?: Blob;
  fileId?: string;
  name: string;
  mimeType: string;
}) {
  const [url, setURL] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      objectURL = "";
    setURL("");
    setError("");
    (async () => {
      try {
        const blob =
          file ??
          (fileId ? await getFarmRepository().getDocumentFile(fileId) : null);
        if (!blob) throw new Error(t("uploadOriginalMissing"));
        if (!active) return;
        objectURL = URL.createObjectURL(blob);
        setURL(objectURL);
      } catch {
        if (active) setError(t("uploadOriginalMissing"));
      }
    })();
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [file, fileId]);
  return (
    <section className="original-document" aria-label={t("uploadOriginal")}>
      <h3>{t("uploadOriginal")}</h3>
      <p className="fine-print">{name}</p>
      {error && (
        <p role="status" className="error-message">
          {error}
        </p>
      )}
      {url &&
        (mimeType === "application/pdf" ? (
          <object
            data={url}
            type="application/pdf"
            aria-label={t("uploadOriginalPDF")}
          >
            <p>{t("uploadPDFPreviewFallback")}</p>
          </object>
        ) : (
          <img src={url} alt={t("uploadOriginalPhoto")} />
        ))}
      {url && mimeType === "application/pdf" && (
        <p className="fine-print">{t("uploadPDFPreviewHint")}</p>
      )}
      {url && (
        <a
          className="button light"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("uploadOpenOriginal")}
        </a>
      )}
    </section>
  );
}
