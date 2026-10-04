import { domainMessage } from "../i18n/messages";
import { createDemoState } from "./demo";
import { isLegacyFarmState } from "./legacy";
import { migrateDemoEnglish } from "./englishDemoMigration";
import { migrateLegacyState } from "./migration";
import { isFarmState } from "./validation";
import type { FarmState } from "./types";
export { isFarmState } from "./validation";
export const STORAGE_KEY = "fieldnote.demo.v2";
export const LEGACY_STORAGE_KEY = "fieldnote.demo.v1";
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type StoredFarm = {
  state: FarmState;
  error: string | null;
  migrated: boolean;
};

export function loadFarm(storage: StoragePort): StoredFarm {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!isFarmState(parsed)) throw new Error("Invalid saved data");
      const english = migrateDemoEnglish(parsed);
      return { state: english.state, error: null, migrated: english.changed };
    }
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null)
      return { state: createDemoState(), error: null, migrated: false };
    const parsed: unknown = JSON.parse(legacy);
    if (!isLegacyFarmState(parsed)) throw new Error("Invalid legacy data");
    const state = migrateDemoEnglish(migrateLegacyState(parsed)).state;
    if (!isFarmState(state)) throw new Error("Invalid migrated data");
    // Reading is side-effect free. The repository persists migration under its write lock.
    // Never remove or overwrite the original v1 key; it is a recovery copy.
    return { state, error: null, migrated: true };
  } catch {
    // Read-only demo until the user explicitly resets. Do not replace corrupt data.
    return {
      state: createDemoState(),
      error: domainMessage("errorStorageRead"),
      migrated: false,
    };
  }
}
export function saveFarm(storage: StoragePort, state: FarmState) {
  if (!isFarmState(state)) throw new Error(domainMessage("errorInvalidDraft"));
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(domainMessage("errorStorageWrite"));
  }
}
