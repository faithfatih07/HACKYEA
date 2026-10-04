import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { createDemoState } from "../domain/demo";
import { FarmRepository } from "../domain/repository";
import { loadFarm, saveFarm, STORAGE_KEY } from "../domain/storage";
import {
  commitProductDocument,
  convertQuantity,
  previewProductDocument,
} from "./domain";
import {
  IndexedDocumentFiles,
  validateFileBytes,
  validateFileMetadata,
} from "./files";
import {
  groundUploadedAnswer,
  retrieveUploadedSections,
  splitSourceText,
  uploadedSections,
} from "./documents";
import { MAX_UPLOAD_BYTES, parseLabelExtraction } from "./schema";
import { matchProductCode } from "../scanning/catalog";
import type { ProductDocumentDraft } from "./types";

export const fixtureDraft = (): ProductDocumentDraft => ({
  id: "upload-1",
  kind: "importProductDocument",
  farmId: "murat-farm",
  actorId: "murat",
  productId: "product-upload",
  existingProductId: null,
  sourceId: "source-upload",
  fileId: "file-upload",
  fileName: "label.png",
  mimeType: "image/png",
  fileSize: 8,
  fields: {
    productName: "Test Fertilizer",
    manufacturer: null,
    category: "fertilizer",
    packageQuantity: 50,
    packageUnit: "kg",
    barcode: "2000000000107",
    batch: null,
    expiryDate: null,
  },
  sourceText: "Test Fertilizer\nNet package weight: 50 kg.",
  sourceLanguage: "English",
  extractionMethod: "manual",
  ownedStock: null,
});
const approval = (d: ProductDocumentDraft, revision = 0) => ({
  approved: true,
  draftId: d.id,
  expectedRevision: revision,
});
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const blob = () => new Blob([bytes], { type: "image/png" });
const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};
const files = () => new IndexedDocumentFiles(`test-${crypto.randomUUID()}`);
const sections = () =>
  splitSourceText(
    "Net package weight: 50 kg.",
    "s",
    "p",
    "Label",
    "f",
    false,
    "English",
  );
const claim = (answer = "One package contains 50 kg.") => ({
  found: true,
  claims: [
    {
      answer,
      sourceId: "s",
      sectionId: "section-1",
      quote: "Net package weight: 50 kg.",
      translation: false,
    },
  ],
});

describe("reviewed product/document imports", () => {
  it("review and cancellation write neither records nor files", async () => {
    const storage = memory(),
      store = files(),
      repo = new FarmRepository(storage, undefined, store),
      draft = fixtureDraft();
    const before = structuredClone(repo.getSnapshot().state);
    expect(repo.previewDocument(draft).valid).toBe(true);
    expect(repo.getSnapshot().state).toEqual(before);
    expect(storage.data.size).toBe(0);
    expect(await store.get(draft.fileId)).toBeNull();
  });
  it("requires explicit confirmation", () => {
    const d = fixtureDraft();
    expect(() =>
      commitProductDocument(createDemoState(), d, {
        ...approval(d),
        approved: false,
      }),
    ).toThrow(/confirmation/);
  });
  it("a 50 kg label alone never creates owned stock", () => {
    const d = fixtureDraft(),
      before = createDemoState(),
      next = commitProductDocument(before, d, approval(d));
    expect(next.inventoryBalances).toEqual(before.inventoryBalances);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(next.products.at(-1)?.packageSize).toEqual({
      quantity: 50,
      unit: "kg",
    });
    expect(next.documentSources.at(-1)?.verification).toBe("userProvided");
    expect(next.activityLog).toHaveLength(1);
  });
  it("uses reviewed package size for app-calculated owned stock", () => {
    const d = fixtureDraft();
    d.fields.packageQuantity = 25;
    d.ownedStock = {
      mode: "packages",
      quantity: 4,
      unit: "unknown",
      storageLocationId: "main",
    };
    expect(previewProductDocument(createDemoState(), d).stock).toEqual({
      quantity: 100,
      unit: "kg",
    });
    const next = commitProductDocument(createDemoState(), d, approval(d));
    expect(next.inventoryBalances.at(-1)?.quantity).toBe(100);
    expect(next.inventoryTransactions.at(-1)).toMatchObject({
      kind: "receipt",
      before: 0,
      after: 100,
    });
    expect(next.inventoryBalances[0].quantity).toBe(800);
  });
  it.each([
    [1500, "g", "kg", 1.5],
    [2500, "ml", "l", 2.5],
    [3, "kg", "kg", 3],
  ] as const)(
    "converts %s %s to %s in application code",
    (q, from, to, result) => expect(convertQuantity(q, from, to)).toBe(result),
  );
  it("rejects incompatible mass and volume instead of assuming a density", () => {
    expect(() => convertQuantity(50, "kg", "l")).toThrow(/compatible/);
    const d = fixtureDraft();
    d.ownedStock = {
      mode: "total",
      quantity: 100,
      unit: "l",
      storageLocationId: "main",
    };
    expect(previewProductDocument(createDemoState(), d).valid).toBe(false);
  });
  it("missing package size blocks package counts; unknown total units never become zero", () => {
    const d = fixtureDraft();
    d.fields.packageQuantity = null;
    d.ownedStock = {
      mode: "packages",
      quantity: 2,
      unit: "unknown",
      storageLocationId: "main",
    };
    expect(previewProductDocument(createDemoState(), d).valid).toBe(false);
    d.ownedStock.mode = "total";
    expect(previewProductDocument(createDemoState(), d).valid).toBe(false);
  });
  it("rejects fractional package counts and missing storage locations", () => {
    const d = fixtureDraft();
    d.ownedStock = {
      mode: "packages",
      quantity: 1.2,
      unit: "kg",
      storageLocationId: "main",
    };
    expect(previewProductDocument(createDemoState(), d).valid).toBe(false);
    d.ownedStock.quantity = 2;
    d.ownedStock.storageLocationId = "missing";
    expect(previewProductDocument(createDemoState(), d).valid).toBe(false);
  });
  it("existing product attachment adds a document but no stock or identity replacement", () => {
    const state = createDemoState(),
      d = fixtureDraft();
    d.productId = d.existingProductId = state.products[0].id;
    d.fields.barcode = null;
    const next = commitProductDocument(state, d, approval(d));
    expect(next.products).toHaveLength(state.products.length);
    expect(next.products[0].name).toBe(state.products[0].name);
    expect(next.inventoryBalances).toEqual(state.inventoryBalances);
    expect(next.inventoryTransactions).toHaveLength(0);
    d.ownedStock = {
      mode: "total",
      quantity: 50,
      unit: "kg",
      storageLocationId: "main",
    };
    expect(previewProductDocument(state, d).valid).toBe(false);
  });
  it("known demo and newly saved barcodes prevent duplicate products", () => {
    const state = createDemoState(),
      d = fixtureDraft();
    d.fields.barcode = "2000000000015";
    expect(previewProductDocument(state, d).valid).toBe(false);
    d.fields.barcode = "2000000000107";
    const next = commitProductDocument(state, d, approval(d));
    const another = {
      ...d,
      id: "another",
      productId: "another-product",
      sourceId: "another-source",
    };
    expect(previewProductDocument(next, another).valid).toBe(false);
    expect(matchProductCode(d.fields.barcode!, next.products).status).toBe(
      "found",
    );
  });
  it("preserves unknown scanned QR payloads without opening URLs", () => {
    const d = fixtureDraft();
    d.scannedCode = "https://example.invalid/opaque-code";
    const next = commitProductDocument(createDemoState(), d, approval(d));
    expect(matchProductCode(d.scannedCode, next.products)).toMatchObject({
      status: "found",
      product: { id: d.productId },
    });
  });
  it("repeated confirmation, including after reload, creates exactly one receipt/document/audit entry", async () => {
    const storage = memory(),
      store = files(),
      d = fixtureDraft();
    d.ownedStock = {
      mode: "packages",
      quantity: 2,
      unit: "kg",
      storageLocationId: "main",
    };
    const repo = new FarmRepository(storage, undefined, store);
    await repo.confirmDocument(d, blob(), approval(d));
    const reload = new FarmRepository(storage, undefined, files());
    await reload.confirmDocument(d, blob(), approval(d));
    const next = loadFarm(storage).state;
    expect(next.inventoryTransactions).toHaveLength(1);
    expect(
      next.documentSources.filter((s) => s.id === d.sourceId),
    ).toHaveLength(1);
    expect(next.activityLog).toHaveLength(1);
    expect(next.inventoryBalances.at(-1)?.quantity).toBe(100);
    expect(await store.get(d.fileId)).not.toBeNull();
  });
  it("metadata and original Blob survive reopening both browser stores", async () => {
    const storage = memory(),
      dbName = `persist-${crypto.randomUUID()}`,
      d = fixtureDraft();
    const repo = new FarmRepository(
      storage,
      undefined,
      new IndexedDocumentFiles(dbName),
    );
    await repo.confirmDocument(d, blob(), approval(d));
    const reloaded = new FarmRepository(
      storage,
      undefined,
      new IndexedDocumentFiles(dbName),
    );
    expect(reloaded.getSnapshot().error).toBeNull();
    expect(
      uploadedSections(reloaded.getSnapshot().state, d.productId)[0].text,
    ).toBe(d.sourceText);
    expect(
      new Uint8Array(
        await (await reloaded.getDocumentFile(d.fileId))!.arrayBuffer(),
      ),
    ).toEqual(bytes);
  });
  it("storage quota failure rolls back the Blob and leaves state unchanged", async () => {
    const storage = memory();
    saveFarm(storage, createDemoState());
    const before = storage.data.get(STORAGE_KEY),
      store = files(),
      d = fixtureDraft();
    const repo = new FarmRepository(
      {
        getItem: storage.getItem,
        setItem: () => {
          throw new Error("quota");
        },
      },
      undefined,
      store,
    );
    await expect(
      repo.confirmDocument(d, blob(), approval(d)),
    ).rejects.toThrow();
    expect(storage.data.get(STORAGE_KEY)).toBe(before);
    expect(repo.getSnapshot().state.revision).toBe(0);
    expect(await store.get(d.fileId)).toBeNull();
  });
  it("IndexedDB failure cannot write a product or stock receipt", async () => {
    const storage = memory(),
      d = fixtureDraft();
    const repo = new FarmRepository(storage, undefined, {
      get: async () => null,
      remove: async () => {},
      put: async () => {
        throw new Error("disk unavailable");
      },
    });
    await expect(
      repo.confirmDocument(d, blob(), approval(d)),
    ).rejects.toThrow();
    expect(storage.data.size).toBe(0);
    expect(repo.getSnapshot().state.products).toHaveLength(
      createDemoState().products.length,
    );
  });
  it("stale review and mutated original are rejected before persistence", async () => {
    const storage = memory(),
      repo = new FarmRepository(storage, undefined, files()),
      d = fixtureDraft();
    await expect(
      repo.confirmDocument(d, blob(), approval(d, 99)),
    ).rejects.toThrow(/changed/);
    await expect(
      repo.confirmDocument(
        d,
        new Blob(["wrong"], { type: "image/png" }),
        approval(d),
      ),
    ).rejects.toThrow(/match/);
    expect(storage.data.size).toBe(0);
  });
  it("reset restores the initial farm records without affecting old confirmation flows", async () => {
    const storage = memory(),
      repo = new FarmRepository(storage, undefined, files()),
      d = fixtureDraft();
    await repo.confirmDocument(d, blob(), approval(d));
    await repo.reset();
    expect(repo.getSnapshot().state.products).toEqual(
      createDemoState().products,
    );
    expect(repo.getSnapshot().state.inventoryBalances[0].quantity).toBe(800);
  });
});

describe("manual/ambiguous imports", () => {
  it("saves an unknown-category manual product and original without pretending extraction succeeded", () => {
    const d = fixtureDraft();
    d.fields = {
      ...d.fields,
      category: "unknown",
      packageQuantity: null,
      packageUnit: "unknown",
      barcode: null,
    };
    d.sourceText = "";
    const next = commitProductDocument(createDemoState(), d, approval(d));
    expect(next.products.at(-1)).toMatchObject({ kind: "unknown", unit: null });
    expect(next.documentSources.at(-1)?.uploaded).toMatchObject({
      extractionMethod: "manual",
      sections: [],
    });
    expect(next.inventoryTransactions).toHaveLength(0);
  });
  it("does not merge a scanned code and printed barcode belonging to different products", () => {
    const state = createDemoState(),
      d = fixtureDraft();
    d.productId = d.existingProductId = state.products[0].id;
    d.fields.barcode = "2000000000015";
    d.scannedCode = "2000000000022";
    expect(previewProductDocument(state, d).valid).toBe(false);
  });
  it("keeps original-language quotations separate from translated English answers", () => {
    const source = splitSourceText(
      "Ambalaj: 50 kg.",
      "s",
      "p",
      "Label",
      "f",
      false,
      "Turkish",
    );
    const result = groundUploadedAnswer(
      {
        found: true,
        claims: [
          {
            answer: "One package contains 50 kg.",
            sourceId: "s",
            sectionId: "section-1",
            quote: "Ambalaj: 50 kg.",
            translation: true,
          },
        ],
      },
      source,
    );
    expect(result.claims[0].quote).toBe("Ambalaj: 50 kg.");
    expect(result.claims[0].translation).toBe(true);
  });
});

describe("source and file validation", () => {
  it("client checks extension/MIME agreement and 10 MB limit", () => {
    expect(
      validateFileMetadata({ name: "LABEL.JPG", type: "image/jpeg", size: 10 }),
    ).toBe("image/jpeg");
    expect(() =>
      validateFileMetadata({
        name: "label.png",
        type: "application/pdf",
        size: 10,
      }),
    ).toThrow();
    expect(() =>
      validateFileMetadata({
        name: "label.pdf",
        type: "application/pdf",
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).toThrow();
    expect(() =>
      validateFileMetadata({ name: "label.gif", type: "image/gif", size: 10 }),
    ).toThrow();
  });
  it("server byte validation rejects oversized and disguised files", () => {
    expect(() =>
      validateFileBytes(new Uint8Array(MAX_UPLOAD_BYTES + 1), "image/png"),
    ).toThrow();
    expect(() => validateFileBytes(bytes, "application/pdf")).toThrow();
    expect(() => validateFileBytes(bytes, "image/png")).not.toThrow();
  });
  it("source splitting preserves original-language text/IDs, never inventing PDF pages", () => {
    const text = "Ambalaj: 50 kg.\n".repeat(100);
    const list = splitSourceText(
      text,
      "source-a",
      "product-a",
      "Label",
      "file-a",
      true,
      "Turkish",
    );
    expect(list.map((s) => s.text).join("")).toBe(text);
    expect(new Set(list.map((s) => s.sectionId)).size).toBe(list.length);
    expect(list.every((s) => s.pageNumber === null && !s.isSyntheticDemo)).toBe(
      true,
    );
    expect(
      retrieveUploadedSections("Package weight?", list).length,
    ).toBeLessThanOrEqual(6);
  });
  it("requires actual supporting source/section IDs and verbatim quotes", () => {
    expect(groundUploadedAnswer(claim(), sections())).toEqual(claim());
    const bad = claim();
    bad.claims[0].sourceId = "invented";
    expect(() => groundUploadedAnswer(bad, sections())).toThrow();
    bad.claims[0].sourceId = "s";
    bad.claims[0].quote = "Invented source text";
    expect(() => groundUploadedAnswer(bad, sections())).toThrow();
  });
  it("rejects invented numeric details and package-weight-as-dose", () => {
    expect(() =>
      groundUploadedAnswer(claim("One package contains 50 g."), sections()),
    ).toThrow();
    expect(() =>
      groundUploadedAnswer(claim("Apply 600 kg."), sections()),
    ).toThrow();
    expect(() =>
      groundUploadedAnswer(
        claim("Apply 50 kg per decare."),
        sections(),
        "What dose per decare?",
      ),
    ).toThrow();
    expect(
      groundUploadedAnswer({ found: false, claims: [] }, sections(), "Dose?")
        .found,
    ).toBe(false);
  });
  it("validates extraction evidence, unknown fields and invalid JSON", () => {
    const raw = {
      ...fixtureDraft().fields,
      manufacturer: null,
      barcode: null,
      readability: "readable",
      sourceText: "Test Fertilizer\nNet package weight: 50 kg.\nFertilizer",
      sourceLanguage: "English",
      evidence: [
        { field: "productName", quote: "Test Fertilizer" },
        { field: "category", quote: "Fertilizer" },
        { field: "packageQuantity", quote: "50 kg" },
        { field: "packageUnit", quote: "50 kg" },
      ],
    };
    expect(parseLabelExtraction(raw).manufacturer).toBeNull();
    expect(() => parseLabelExtraction({ ...raw, barcode: "123" })).toThrow();
    expect(() => parseLabelExtraction("not json")).toThrow();
    expect(() => parseLabelExtraction({ ...raw, packageUnit: "g" })).toThrow();
    expect(() =>
      parseLabelExtraction({ ...raw, packageQuantity: 5 }),
    ).toThrow();
    expect(() => parseLabelExtraction({ ...raw, ownedStock: 100 })).toThrow();
  });
});
