import { IndexedDocumentFiles } from "../uploads/files";
import { FarmRepository } from "./repository";
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "./storage";
import type { StoragePort } from "./storage";

// Only this browser adapter touches localStorage. Domain and React stay independent.
const browserStorage: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
let repository: FarmRepository | undefined;
export function getFarmRepository() {
  if (!repository) {
    repository = new FarmRepository(
      browserStorage,
      (write) =>
        navigator.locks
          ? navigator.locks.request("fieldnote-demo-write", write)
          : Promise.resolve().then(write),
      new IndexedDocumentFiles(),
    );
    window.addEventListener("storage", (event) => {
      if (
        event.key === STORAGE_KEY ||
        event.key === LEGACY_STORAGE_KEY ||
        event.key === null
      )
        repository!.refresh();
    });
  }
  return repository;
}
export function readPreference(key: string) {
  try {
    return browserStorage.getItem("fieldnote." + key);
  } catch {
    return null;
  }
}
export function savePreference(key: string, value: string) {
  try {
    browserStorage.setItem("fieldnote." + key, value);
  } catch {
    /* Session-only preference. */
  }
}
