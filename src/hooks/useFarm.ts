import { domainMessage } from "../i18n/messages";
import { useEffect, useState } from "react";
import { createDemoState } from "../domain/demo";
import { loadFarm, saveFarm, STORAGE_KEY } from "../domain/storage";
import type { FarmState } from "../domain/types";

function read() {
  try {
    return loadFarm(window.localStorage);
  } catch {
    return {
      state: createDemoState(),
      error: domainMessage("errorStorageUnavailable"),
    };
  }
}

export function useFarm() {
  const [initial] = useState(read);
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const update = (next: FarmState) => {
    setState(next);
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const result = read();
        update(result.state);
        setStorageError(result.error);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function commit(transform: (latest: FarmState) => FarmState) {
    const write = () => {
      const latest = read();
      if (latest.error) {
        setStorageError(latest.error);
        throw new Error(latest.error);
      }
      update(latest.state);
      const next = transform(latest.state);
      saveFarm(window.localStorage, next);
      update(next);
      setStorageError(null);
      return next;
    };
    // Serialize same-origin tabs where Web Locks is available. Each write still re-reads storage.
    return navigator.locks
      ? navigator.locks.request("fieldnote-demo-write", write)
      : write();
  }
  async function reset() {
    const write = () => {
      const fresh = createDemoState();
      saveFarm(window.localStorage, fresh);
      update(fresh);
      setStorageError(null);
    };
    return navigator.locks
      ? navigator.locks.request("fieldnote-demo-write", write)
      : write();
  }
  return { state, storageError, commit, reset };
}
