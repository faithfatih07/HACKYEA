import { useSyncExternalStore } from "react";
import { getFarmRepository } from "../domain/browserRepository";

export function useFarm() {
  const repository = getFarmRepository();
  const snapshot = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
  );
  return {
    state: snapshot.state,
    storageError: snapshot.error,
    confirm: repository.confirm,
    preview: repository.preview,
    reset: repository.reset,
    confirmDocument: repository.confirmDocument,
  };
}
