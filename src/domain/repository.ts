import {
  commitProductDocument,
  previewProductDocument,
} from "../uploads/domain";
import type { ProductDocumentDraft } from "../uploads/types";
import type { DocumentFileStore } from "../uploads/files";
import { validateFileBytes } from "../uploads/files";
import { createDemoState } from "./demo";
import { domainMessage } from "../i18n/messages";
import { commitAction, previewAction } from "./actions";
import { loadFarm, saveFarm } from "./storage";
import type { StoragePort, StoredFarm } from "./storage";
import type { ActionDraft, Confirmation } from "./types";

export class FarmRepository {
  private snapshot: StoredFarm;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  constructor(
    private storage: StoragePort,
    private lock: <T>(write: () => T) => Promise<T> = (write) =>
      Promise.resolve().then(write),
    private files?: DocumentFileStore,
  ) {
    this.snapshot = loadFarm(storage);
    this.ready = this.snapshot.migrated
      ? this.write(() => {
          // Re-read under the same lock as commits: another tab may already have migrated/consumed.
          const latest = loadFarm(this.storage);
          if (!latest.error && latest.migrated)
            saveFarm(this.storage, latest.state);
          this.publish({ ...latest, migrated: false });
        }).catch(() => {
          this.publish({
            ...this.snapshot,
            error: domainMessage("errorStorageWrite"),
          });
        })
      : Promise.resolve();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: StoredFarm) {
    this.snapshot = snapshot;
    this.listeners.forEach((l) => l());
  }
  refresh = () => this.publish(loadFarm(this.storage));
  preview = (draft: ActionDraft) => previewAction(this.snapshot.state, draft);
  // Queue this instance; Web Locks (when provided) serialize other browser tabs too.
  private write<T>(action: () => T): Promise<T> {
    const result = this.queue.then(() => this.lock(action));
    this.queue = result.catch(() => {});
    return result;
  }
  confirm = (draft: ActionDraft, confirmation: Confirmation) =>
    this.write(() => {
      const latest = loadFarm(this.storage);
      if (latest.error) {
        this.publish(latest);
        throw new Error(latest.error);
      }
      const next = commitAction(latest.state, draft, confirmation);
      // One serialized state contains balance, task, operation, transaction and audit log.
      // Publish only after persistence succeeds, so quota failures cannot half-apply.
      saveFarm(this.storage, next);
      this.publish({ state: next, error: null, migrated: latest.migrated });
      return next;
    });
  previewDocument = (draft: ProductDocumentDraft) =>
    previewProductDocument(this.snapshot.state, draft);
  getDocumentFile = (id: string) =>
    this.files?.get(id) ?? Promise.resolve(null);
  confirmDocument = async (
    draft: ProductDocumentDraft,
    file: Blob,
    confirmation: Confirmation,
  ) =>
    this.write(async () => {
      const latest = loadFarm(this.storage);
      if (latest.error) throw new Error(latest.error);
      const next = commitProductDocument(latest.state, draft, confirmation);
      if (next === latest.state) return next;
      if (!this.files)
        throw new Error(
          "Document file storage is unavailable. Nothing was saved.",
        );
      if (file.size !== draft.fileSize || file.type !== draft.mimeType)
        throw new Error("The original file does not match the reviewed draft.");
      validateFileBytes(
        new Uint8Array(await file.arrayBuffer()),
        draft.mimeType,
      );
      if (await this.files.get(draft.fileId))
        throw new Error("This file ID already exists. Start a new upload.");
      // Persist the original first. No farm records are published if this fails.
      await this.files.put(draft.fileId, file);
      try {
        saveFarm(this.storage, next);
      } catch (error) {
        // Cross-store rollback: metadata never points to a missing original.
        // A failed cleanup/crash can leave an unreferenced file, never a stock receipt.
        try {
          await this.files.remove(draft.fileId);
        } catch {
          /* Unreferenced file only. */
        }
        throw error;
      }
      this.publish({ state: next, error: null, migrated: false });
      return next;
    });
  reset = () =>
    this.write(() => {
      const state = createDemoState();
      saveFarm(this.storage, state);
      this.publish({ state, error: null, migrated: false });
      return state;
    });
}
