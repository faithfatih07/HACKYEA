import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { t } from "../i18n";
import type { FarmState, Confirmation } from "../domain/types";
import { createId } from "../domain/id";
import { productCatalog } from "../scanning/catalog";
import type { ProductDocumentDraft } from "../uploads/types";
import type { LabelFields } from "../uploads/schema";
import { validateFileMetadata, validateFileBytes } from "../uploads/files";
import { requestLabelExtraction } from "../uploads/client";
import { duplicateProduct, previewProductDocument } from "../uploads/domain";
import { OriginalDocument } from "./OriginalDocument";
import "../uploads.css";

const blank: LabelFields = {
  productName: null,
  manufacturer: null,
  category: "unknown",
  packageQuantity: null,
  packageUnit: "unknown",
  barcode: null,
  batch: null,
  expiryDate: null,
};
export function ProductUpload({
  state,
  scannedCode = null,
  confirm,
  onSaved,
  onCancel,
}: {
  state: FarmState;
  scannedCode?: string | null;
  confirm: (
    draft: ProductDocumentDraft,
    file: Blob,
    confirmation: Confirmation,
  ) => Promise<FarmState>;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<LabelFields>({
    ...blank,
    barcode: scannedCode && /^\d{8,14}$/.test(scannedCode) ? scannedCode : null,
  });
  const [packageText, setPackageText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{ field: string; quote: string }[]>(
    [],
  );
  const [target, setTarget] = useState("");
  const [owned, setOwned] = useState("");
  const [ownedMode, setOwnedMode] = useState<"packages" | "total">("total");
  const [ownedUnit, setOwnedUnit] = useState<
    "kg" | "g" | "l" | "ml" | "unknown"
  >("unknown");
  const [location, setLocation] = useState("");
  const [method, setMethod] = useState<"gemini" | "manual">("manual");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [ids, setIds] = useState(() => ({
    id: createId(),
    productId: createId(),
    sourceId: createId(),
    fileId: createId(),
  }));
  const request = useRef<AbortController | null>(null),
    saveLock = useRef(false);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    setReviewing(false);
  }, [state.revision]);
  function edited() {
    setReviewing(false);
    setError("");
  }
  function change<K extends keyof LabelFields>(key: K, value: LabelFields[K]) {
    edited();
    setFields((f) => ({ ...f, [key]: value }));
  }
  async function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    edited();
    setNotice("");
    try {
      const mime = validateFileMetadata(chosen);
      validateFileBytes(new Uint8Array(await chosen.arrayBuffer()), mime);
      setFile(chosen);
      setFields({
        ...blank,
        barcode:
          scannedCode && /^\d{8,14}$/.test(scannedCode) ? scannedCode : null,
      });
      setPackageText("");
      setSourceText("");
      setSourceLanguage(null);
      setEvidence([]);
      setMethod("manual");
      setOwned("");
      setOwnedUnit("unknown");
      setOwnedMode("total");
      setLocation("");
      setTarget("");
      setIds({
        id: createId(),
        productId: createId(),
        sourceId: createId(),
        fileId: createId(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadInvalid"));
    }
  }
  async function extract() {
    if (!file || busy || saving) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setReviewing(false);
    try {
      const result = await requestLabelExtraction(
        file,
        AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]),
      );
      if (controller.signal.aborted) return;
      if (result.readability !== "readable") {
        setMethod("manual");
        setNotice(
          t(
            result.readability === "multipleProducts"
              ? "uploadMultiple"
              : "uploadUnreadable",
          ),
        );
        return;
      }
      setFields({
        productName: result.productName,
        manufacturer: result.manufacturer,
        category: result.category,
        packageQuantity: result.packageQuantity,
        packageUnit: result.packageUnit,
        barcode:
          result.barcode ??
          (/^\d{8,14}$/.test(scannedCode ?? "") ? scannedCode : null),
        batch: result.batch,
        expiryDate: result.expiryDate,
      });
      setPackageText(
        result.packageQuantity === null ? "" : String(result.packageQuantity),
      );
      setOwnedUnit(result.packageUnit);
      setSourceText(result.sourceText);
      setSourceLanguage(result.sourceLanguage);
      setEvidence(result.evidence);
      setMethod("gemini");
      setNotice(t("uploadExtracted"));
      const duplicate = duplicateProduct(state, result.barcode, scannedCode);
      if (duplicate) {
        setTarget(duplicate.id);
        setOwned("");
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setMethod("manual");
        setError(err instanceof Error ? err.message : t("uploadAIFailed"));
      }
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  const parsedFields = {
    ...fields,
    packageQuantity: packageText.trim()
      ? Number(packageText.replace(",", "."))
      : null,
  };
  const draft: ProductDocumentDraft = {
    ...ids,
    farmId: state.farm.id,
    actorId: state.farm.demoUserId,
    kind: "importProductDocument",
    productId: target || ids.productId,
    existingProductId: target || null,
    fileName: file?.name ?? "",
    fileId: ids.fileId,
    mimeType: file?.type as ProductDocumentDraft["mimeType"],
    fileSize: file?.size ?? 0,
    fields: parsedFields,
    sourceText,
    sourceLanguage,
    extractionMethod: method,
    scannedCode,
    ownedStock:
      target || !owned.trim()
        ? null
        : {
            mode: ownedMode,
            quantity: Number(owned.replace(",", ".")),
            unit: ownedUnit,
            storageLocationId: location,
          },
  };
  const preview = previewProductDocument(state, draft);
  const duplicate = duplicateProduct(state, fields.barcode, scannedCode);
  async function save() {
    if (!file || !reviewing || !preview.valid || saveLock.current || busy)
      return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      await confirm(draft, file, {
        approved: true,
        draftId: draft.id,
        expectedRevision: preview.revision,
      });
      onSaved(draft.productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadSaveFailed"));
      setReviewing(false);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="upload-flow" aria-label={t("uploadAdd")}>
      {scannedCode && (
        <p className="upload-code">
          {t("uploadScannedCode")} <code>{scannedCode}</code>
        </p>
      )}
      <div className="panel upload-file-choice">
        <h2>{t("uploadChoose")}</h2>
        <div className="upload-file-buttons">
          <label className="button light">
            {t("uploadTakePhoto")}
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              aria-label={t("uploadTakePhoto")}
              disabled={saving || busy}
              onChange={selectFile}
            />
          </label>
          <label className="button light">
            {t("uploadGallery")}
            <input
              type="file"
              accept="image/jpeg,image/png"
              aria-label={t("uploadGallery")}
              disabled={saving || busy}
              onChange={selectFile}
            />
          </label>
          <label className="button light">
            {t("uploadPDF")}
            <input
              type="file"
              accept="application/pdf"
              aria-label={t("uploadPDF")}
              disabled={saving || busy}
              onChange={selectFile}
            />
          </label>
        </div>
        <p className="fine-print">{t("uploadLimits")}</p>
        {file && (
          <>
            <p>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              className="button dark"
              disabled={busy || saving}
              aria-busy={busy}
              onClick={extract}
            >
              {t(busy ? "uploadReading" : "uploadExtract")}
            </button>
            <p className="fine-print">{t("uploadSentToGemini")}</p>
          </>
        )}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="upload-notice" role="status">
          {notice}
        </p>
      )}
      {file && (
        <div className="upload-review-layout">
          <OriginalDocument file={file} name={file.name} mimeType={file.type} />
          <div className="panel upload-fields">
            <h2>{t("uploadReview")}</h2>
            <span className="pill">
              {t(method === "gemini" ? "uploadAIExtraction" : "uploadManual")}
            </span>
            <fieldset disabled={busy || saving}>
              <label>
                {t("uploadTarget")}
                <select
                  value={target}
                  onChange={(e) => {
                    edited();
                    setTarget(e.target.value);
                    setOwned("");
                  }}
                >
                  <option value="">{t("uploadNewProduct")}</option>
                  {productCatalog(state.products).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {duplicate && target !== duplicate.id && (
                <div className="upload-notice">
                  {t("uploadDuplicate", { name: duplicate.name })}
                  <button
                    className="button light"
                    onClick={() => {
                      edited();
                      setTarget(duplicate.id);
                      setOwned("");
                    }}
                  >
                    {t("uploadAttachExisting")}
                  </button>
                </div>
              )}
              <label>
                {t("uploadProductName")}
                <input
                  value={fields.productName ?? ""}
                  maxLength={200}
                  onChange={(e) =>
                    change("productName", e.target.value || null)
                  }
                  placeholder={t("uploadUnknown")}
                />
              </label>
              <label>
                {t("uploadManufacturer")}
                <input
                  value={fields.manufacturer ?? ""}
                  maxLength={200}
                  onChange={(e) =>
                    change("manufacturer", e.target.value || null)
                  }
                  placeholder={t("uploadUnknown")}
                />
              </label>
              <label>
                {t("uploadCategory")}
                <select
                  value={fields.category}
                  onChange={(e) =>
                    change(
                      "category",
                      e.target.value as LabelFields["category"],
                    )
                  }
                >
                  <option value="unknown">Unknown</option>
                  <option value="fertilizer">Fertilizer</option>
                  <option value="pesticide">Pesticide</option>
                </select>
              </label>
              <div className="upload-grid">
                <label>
                  {t("uploadPackageQuantity")}
                  <input
                    inputMode="decimal"
                    value={packageText}
                    onChange={(e) => {
                      edited();
                      setPackageText(e.target.value);
                    }}
                    placeholder={t("uploadUnknown")}
                  />
                </label>
                <label>
                  {t("uploadPackageUnit")}
                  <select
                    value={fields.packageUnit}
                    onChange={(e) =>
                      change(
                        "packageUnit",
                        e.target.value as LabelFields["packageUnit"],
                      )
                    }
                  >
                    {["unknown", "kg", "g", "l", "ml"].map((u) => (
                      <option key={u} value={u}>
                        {u === "unknown" ? "Unknown" : u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="fine-print">{t("uploadPackageNotStock")}</p>
              {(
                [
                  ["barcode", "uploadBarcode"],
                  ["batch", "uploadBatch"],
                  ["expiryDate", "uploadExpiry"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {t(label)}
                  <input
                    value={fields[key] ?? ""}
                    maxLength={200}
                    onChange={(e) => change(key, e.target.value || null)}
                    placeholder={t("uploadUnknown")}
                  />
                </label>
              ))}
              <label>
                {t("uploadSourceText")}
                <textarea
                  rows={7}
                  value={sourceText}
                  maxLength={24000}
                  onChange={(e) => {
                    edited();
                    setSourceText(e.target.value);
                    setMethod("manual");
                  }}
                />
              </label>
              <p className="fine-print">{t("uploadSourceTrust")}</p>
              {evidence.length > 0 && (
                <details>
                  <summary>{t("uploadEvidence")}</summary>
                  {evidence.map((e, i) => (
                    <blockquote key={i}>
                      <strong>{e.field}</strong>
                      <p>{e.quote}</p>
                    </blockquote>
                  ))}
                </details>
              )}
              {target ? (
                <p className="upload-notice">{t("uploadAttachNoStock")}</p>
              ) : (
                <section className="upload-owned">
                  <h3>{t("uploadOwned")}</h3>
                  <p>{t("uploadOwnedHelp")}</p>
                  <label>
                    {t("uploadOwnedMode")}
                    <select
                      value={ownedMode}
                      onChange={(e) => {
                        edited();
                        setOwnedMode(e.target.value as "packages" | "total");
                      }}
                    >
                      <option value="total">Compatible total quantity</option>
                      <option value="packages">Package count</option>
                    </select>
                  </label>
                  <div className="upload-grid">
                    <label>
                      {t("uploadOwnedQuantity")}
                      <input
                        value={owned}
                        inputMode="decimal"
                        onChange={(e) => {
                          edited();
                          setOwned(e.target.value);
                        }}
                        placeholder={t("uploadOptional")}
                      />
                    </label>
                    {ownedMode === "total" && (
                      <label>
                        {t("uploadOwnedUnit")}
                        <select
                          value={ownedUnit}
                          onChange={(e) => {
                            edited();
                            setOwnedUnit(e.target.value as typeof ownedUnit);
                          }}
                        >
                          {["unknown", "kg", "g", "l", "ml"].map((u) => (
                            <option key={u} value={u}>
                              {u === "unknown" ? "Choose unit…" : u}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label>
                    {t("uploadStorage")}
                    <select
                      value={location}
                      onChange={(e) => {
                        edited();
                        setLocation(e.target.value);
                      }}
                    >
                      <option value="">Choose a storage location…</option>
                      {state.storageLocations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              )}
            </fieldset>
            {!reviewing && (
              <button
                className="button dark full"
                disabled={busy || saving}
                onClick={() => setReviewing(true)}
              >
                {t("uploadReviewImport")}
              </button>
            )}
            {reviewing && (
              <section
                className="upload-preview"
                aria-label={t("uploadPreview")}
              >
                <h3>{t("uploadPreview")}</h3>
                <p>{t("uploadNothingSaved")}</p>
                {preview.issues.map((i, index) => (
                  <p role="alert" className="error-message" key={index}>
                    {i.message}
                  </p>
                ))}
                <p>
                  {target
                    ? productCatalog(state.products).find(
                        (p) => p.id === target,
                      )?.name
                    : fields.productName}
                </p>
                <p>
                  {target
                    ? t("uploadAttachNoStock")
                    : preview.stock
                      ? t("uploadStockPreview", {
                          amount: preview.stock.quantity,
                          unit: preview.stock.unit,
                        })
                      : t("uploadProductOnly")}
                </p>
                <p>{t("uploadOriginalSaved")}</p>
                <button
                  className="button dark full"
                  disabled={!preview.valid || saving || busy}
                  aria-busy={saving}
                  onClick={save}
                >
                  {t(saving ? "uploadSaving" : "uploadConfirm")}
                </button>
              </section>
            )}
          </div>
        </div>
      )}
      <button
        className="button light full"
        disabled={saving}
        onClick={onCancel}
      >
        {t("uploadCancel")}
      </button>
    </section>
  );
}
