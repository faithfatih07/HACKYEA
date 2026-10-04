import en from "./en.json";
import { selectFarmView } from "../domain/selectors";
import type { FarmView, StateInput } from "../domain/selectors";
import { migrateDemoEnglish } from "../domain/englishDemoMigration";

// Accept the old locale parameter for callers/data compatibility, but never
// select a second dictionary or let an old preference change the interface.
export type Language = "tr" | "en";
export type MessageKey = keyof typeof en;
export function translate(
  key: MessageKey,
  values: Record<string, unknown> = {},
  _locale: Language = "en",
) {
  return en[key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? `{${name}}`),
  );
}
export const domainMessage = (
  key: MessageKey,
  values: Record<string, unknown> = {},
) => translate(key, values);
export function dataText(value: string, _locale: Language) {
  return value;
}

// This display copy also covers snapshots captured before repository readiness.
// No generic text translation is applied to user-authored names or notes.
export function localizeFarm(
  input: StateInput,
  _locale: Language = "en",
): FarmView {
  const domain = "domain" in input ? input.domain : input;
  return selectFarmView(migrateDemoEnglish(domain).state);
}
export function localizeMessage(value: string, _locale: Language = "en") {
  return value;
}
