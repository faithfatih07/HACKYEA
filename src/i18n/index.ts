import { translate, localizeMessage as translateMessage } from "./messages";
import type { MessageKey } from "./messages";
export { localizeFarm } from "./messages";
export type { Language } from "./messages";

// One interface language. Historical preferences are deliberately ignored,
// not deleted: they cannot restore a different language after a refresh.
export function useLanguage() {
  return "en" as const;
}
export const language = () => "en" as const;
export function t(key: MessageKey, values: Record<string, unknown> = {}) {
  return translate(key, values);
}
export function formatKg(value: number | null) {
  if (value === null) return t("unknownQuantity");
  return t("amountKg", {
    value0: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(
      value,
    ),
  });
}
export function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB");
}
export function localizeMessage(value: string) {
  return translateMessage(value, "en");
}
