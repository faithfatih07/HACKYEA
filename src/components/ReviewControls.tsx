import { Check } from "lucide-react";
import { t } from "../i18n";

export function ReviewControls({
  valid,
  busy,
  onCancel,
  onConfirm,
}: {
  valid: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="review-controls">
      <button
        type="button"
        className="button light"
        disabled={busy}
        onClick={onCancel}
      >
        {t("cancelDraft")}
      </button>
      <button
        type="button"
        className="button dark"
        disabled={!valid || busy}
        onClick={onConfirm}
      >
        <Check size={18} />
        {t(busy ? "saving" : "confirmSave")}
      </button>
    </div>
  );
}
