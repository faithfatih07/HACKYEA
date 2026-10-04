import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, Square } from "lucide-react";
import { t, useLanguage } from "../i18n";
import type { Product } from "../domain/types";
import type { MessageKey } from "../i18n/messages";
import {
  matchProductCode,
  productCatalog,
  selectCatalogProduct,
} from "../scanning/catalog";
import {
  browserCamera,
  cameraFailure,
  CameraSession,
} from "../scanning/camera";
import type { CameraFailure } from "../scanning/camera";

const failureMessages: Record<CameraFailure, MessageKey> = {
  secure: "scanSecure",
  unsupported: "scanUnsupported",
  denied: "scanDenied",
  missing: "scanNoCamera",
  busy: "scanCameraBusy",
  failed: "scanCameraFailed",
};

export function ProductScanner({
  products,
  go,
  onMatch,
  onAddDocument,
}: {
  products: Product[];
  go: (route: string) => void;
  onMatch?: () => void;
  onAddDocument?: (code: string) => void;
}) {
  useLanguage();
  const [code, setCode] = useState("");
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState("");
  const [active, setActive] = useState(false);
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const mounted = useRef(false);
  const catalog = productCatalog(products);

  function stop() {
    session.current?.stop();
    if (video.current) video.current.srcObject = null;
    setActive(false);
  }
  useEffect(() => {
    mounted.current = true;
    const close = () => {
      session.current?.stop();
      if (mounted.current) setActive(false);
    };
    const visibility = () => {
      if (document.hidden) close();
    };
    window.addEventListener("pagehide", close);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      session.current?.stop();
      window.removeEventListener("pagehide", close);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  function resolve(input: string) {
    stop();
    setFailure(null);
    setSelected("");
    const result = matchProductCode(input, products);
    setInvalid(result.status === "invalid");
    setUnknownCode(result.status === "unknown" ? result.code : null);
    if (result.status === "found") {
      onMatch?.();
      go(`products/${result.product.id}`);
    }
  }

  async function start() {
    if (active) return;
    setFailure(null);
    setInvalid(false);
    setUnknownCode(null);
    if (!window.isSecureContext) {
      setFailure("secure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setFailure("unsupported");
      return;
    }
    if (!video.current) return;
    setActive(true);
    session.current ??= new CameraSession(browserCamera);
    try {
      await session.current.start(video.current, (value) => {
        if (mounted.current) resolve(value);
      });
    } catch (error) {
      if (mounted.current) {
        setActive(false);
        setFailure(cameraFailure(error));
      }
    }
  }

  return (
    <div className="scanner-layout">
      <section className="panel scan-camera" aria-label={t("scanCameraTitle")}>
        <h2>
          <Camera size={22} /> {t("scanCameraTitle")}
        </h2>
        <p>{t("scanCameraHelp")}</p>
        <div className={`scan-view ${active ? "is-active" : ""}`}>
          <video
            ref={video}
            muted
            playsInline
            aria-hidden={!active}
            aria-label={t("scanPreview")}
          />
          {!active && (
            <span className="scan-placeholder">
              <ScanLine size={40} />
              {t("scanCameraIdle")}
            </span>
          )}
        </div>
        <p className="fine-print" role="status">
          {t(active ? "scanSearching" : "scanPermissionHint")}
        </p>
        <div className="scan-actions">
          <button className="button dark" disabled={active} onClick={start}>
            <ScanLine size={20} />
            {t("scanStart")}
          </button>
          {active && (
            <button className="button light" onClick={stop}>
              <Square size={18} />
              {t("scanStop")}
            </button>
          )}
        </div>
        {failure && (
          <p className="error-message" role="alert">
            {t(failureMessages[failure])}
          </p>
        )}
      </section>
      <section className="panel scan-manual">
        <h2>{t("scanManualTitle")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            resolve(code);
          }}
        >
          <label htmlFor="product-code">{t("scanCodeLabel")}</label>
          <input
            id="product-code"
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={512}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("scanCodePlaceholder")}
          />
          <button
            className="button dark full"
            type="submit"
            disabled={!code.trim()}
          >
            {t("scanFindProduct")}
          </button>
        </form>
        {invalid && (
          <p className="error-message" role="alert">
            {t("scanInvalidCode")}
          </p>
        )}
        {unknownCode !== null && (
          <div className="scan-not-found" role="status">
            <strong>{t("scanProductMissing")}</strong>
            <code>{unknownCode}</code>
            <p>{t("scanUnknownHelp")}</p>
            {onAddDocument && (
              <button
                className="button light"
                onClick={() => {
                  stop();
                  onAddDocument(unknownCode);
                }}
              >
                {t("uploadAdd")}
              </button>
            )}
          </div>
        )}
        <label htmlFor="scan-product">{t("scanChooseProduct")}</label>
        <select
          id="scan-product"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t("scanChoosePlaceholder")}</option>
          {catalog.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <button
          className="button light full"
          disabled={!selected}
          onClick={() => {
            const product = selectCatalogProduct(selected, products);
            if (product) {
              stop();
              go(`products/${product.id}`);
            }
          }}
        >
          {t("scanOpenProduct")}
        </button>
      </section>
      <section className="panel scan-explainer">
        <h2>{t("scanScopeTitle")}</h2>
        <p>{t("scanScope")}</p>
        <button className="button light" onClick={() => go("demo-labels")}>
          {t("scanDemoLabels")}
        </button>
      </section>
    </div>
  );
}
