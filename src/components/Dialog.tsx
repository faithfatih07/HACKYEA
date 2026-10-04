import { t } from "../i18n";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-labelledby="dialog-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="dialog-head">
        <div>
          <span className="eyebrow">{t("fictionalDemoData")}</span>
          <h2 id="dialog-heading">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("closeDialog")}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
