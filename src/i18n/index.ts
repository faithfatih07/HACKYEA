import { useSyncExternalStore } from "react";
import { translate, localizeMessage as translateMessage } from "./messages";
import type { Language, MessageKey } from "./messages";
import { readPreference, savePreference } from "../domain/browserRepository";
export { localizeFarm } from "./messages";
export type { Language } from "./messages";
const listeners = new Set<() => void>();
let current: Language = readPreference("language") === "en" ? "en" : "tr";

const emit = () => listeners.forEach((listener) => listener());
export function setLanguage(language: Language) {
  current = language;
  savePreference("language", language);
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
export function formatKg(value: number | null) {
  if (value === null) return t("unknownQuantity");
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
