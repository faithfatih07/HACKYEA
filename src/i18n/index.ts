import { useSyncExternalStore } from "react";
import { translate, localizeMessage as translateMessage } from "./messages";
import type { Language, MessageKey } from "./messages";
export { localizeFarm } from "./messages";
export type { Language } from "./messages";
const listeners = new Set<() => void>();
const STORAGE_KEY = "fieldnote.language";
let current: Language = (() => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
})();

const emit = () => listeners.forEach((listener) => listener());
export function setLanguage(language: Language) {
  current = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* session fallback */
  }
  emit();
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => "tr" as Language,
  );
}
export const language = () => current;

export function t(key: MessageKey, values: Record<string, unknown> = {}) {
  return translate(key, values, current);
}
export function formatKg(value: number) {
  return t("amountKg", {
    value0: new Intl.NumberFormat(current === "tr" ? "tr-TR" : "en", {
      maximumFractionDigits: 3,
    }).format(value),
  });
}
export function formatDate(value: string) {
  return new Date(value).toLocaleString(current === "tr" ? "tr-TR" : "en-GB");
}
export function localizeMessage(value: string) {
  return translateMessage(value, current);
}
