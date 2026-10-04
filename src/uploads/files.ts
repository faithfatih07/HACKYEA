import { MAX_UPLOAD_BYTES, uploadMimeTypes } from "./schema";
import type { UploadMime } from "./schema";

export function validateFileMetadata(file: {
  name: string;
  type: string;
  size: number;
}): UploadMime {
  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_UPLOAD_BYTES
  )
    throw new Error("Choose a non-empty file of 10 MB or less.");
  const expected = /\.jpe?g$/i.test(file.name)
    ? "image/jpeg"
    : /\.png$/i.test(file.name)
      ? "image/png"
      : /\.pdf$/i.test(file.name)
        ? "application/pdf"
        : null;
  if (
    !expected ||
    file.type !== expected ||
    !uploadMimeTypes.includes(file.type as UploadMime)
  )
    throw new Error(
      "Supported files: JPG, PNG and PDF. The file type and extension must agree.",
    );
  return expected;
}
export function validateFileBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("Choose a non-empty file of 10 MB or less.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const pdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  if (!(
    (mime === "image/png" && png) ||
    (mime === "image/jpeg" && jpeg) ||
    (mime === "application/pdf" && pdf)
  ))
    throw new Error("The file contents do not match a supported image or PDF.");
}
export interface DocumentFileStore {
  put(id: string, file: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
}
export class IndexedDocumentFiles implements DocumentFileStore {
  constructor(private name = "agrunio.document-files") {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          new Error("Uploaded files require IndexedDB. Try another browser."),
        );
        return;
      }
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Could not open document storage."));
      request.onblocked = () =>
        reject(new Error("Document storage is blocked by another tab."));
    });
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", mode),
        req = action(tx.objectStore("files"));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(new Error("Document storage failed. Nothing was saved."));
      };
    });
  }
  async put(id: string, file: Blob) {
    await this.transaction("readwrite", (s) => s.put(file, id));
  }
  async get(id: string) {
    return (
      ((await this.transaction("readonly", (s) => s.get(id))) as
        Blob | undefined) ?? null
    );
  }
  async remove(id: string) {
    await this.transaction("readwrite", (s) => s.delete(id));
  }
}
