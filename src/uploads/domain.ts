import { z } from "zod";
import type {
  FarmState,
  Confirmation,
  Product,
  ActionPreview,
} from "../domain/types";
import { labelFieldsSchema, MAX_UPLOAD_BYTES, uploadMimeTypes } from "./schema";
import type { ProductDocumentDraft } from "./types";
import { productCatalog, matchProductCode } from "../scanning/catalog";
import { splitSourceText } from "./documents";
import { isFarmState } from "../domain/validation";

const id = z.string().min(1).max(100);
export const productDocumentDraftSchema = z
  .object({
    id,
    farmId: id,
    actorId: id,
    kind: z.literal("importProductDocument"),
    productId: id,
    existingProductId: id.nullable(),
    sourceId: id,
    fileId: id,
    fileName: z.string().min(1).max(240),
    mimeType: z.enum(uploadMimeTypes),
    fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    fields: labelFieldsSchema,
    sourceText: z.string().max(24000),
    sourceLanguage: z.string().max(200).nullable(),
    extractionMethod: z.enum(["gemini", "manual"]),
    ownedStock: z
      .object({
        mode: z.enum(["packages", "total"]),
        quantity: z.number().finite().positive().max(1_000_000),
        unit: z.enum(["kg", "g", "l", "ml", "unknown"]),
        storageLocationId: id,
      })
      .strict()
      .nullable(),
    scannedCode: z.string().max(512).nullable().optional(),
  })
  .strict();
export function baseUnit(unit: string): "kg" | "l" | null {
  return unit === "kg" || unit === "g"
    ? "kg"
    : unit === "l" || unit === "ml"
      ? "l"
      : null;
}
export function convertQuantity(
  quantity: number,
  from: string,
  to: "kg" | "l",
) {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 1_000_000 ||
    baseUnit(from) !== to
  )
    throw new Error(
      "Choose a positive quantity with compatible mass or volume units.",
    );
  const value =
    Math.round(quantity * (from === "g" || from === "ml" ? 0.001 : 1) * 1000) /
    1000;
  if (value <= 0 || value > 1_000_000)
    throw new Error(
      "Stock quantity is outside the supported range (0.001–1,000,000).",
    );
  return value;
}
export function resolveOwnedStock(draft: ProductDocumentDraft) {
  const owned = draft.ownedStock;
  if (!owned) return null;
  if (draft.existingProductId)
    throw new Error("Attaching a document cannot add owned stock.");
  if (owned.mode === "packages") {
    const { packageQuantity, packageUnit } = draft.fields;
    const unit = baseUnit(packageUnit);
    if (packageQuantity === null || !unit)
      throw new Error(
        "Review a known package size before converting package count.",
      );
    if (!Number.isInteger(owned.quantity))
      throw new Error("Package count must be a positive whole number.");
    return {
      quantity: convertQuantity(
        owned.quantity * packageQuantity,
        packageUnit,
        unit,
      ),
      unit,
    };
  }
  const unit = baseUnit(owned.unit);
  if (!unit) throw new Error("Select the unit of the total quantity owned.");
  const packUnit = baseUnit(draft.fields.packageUnit);
  if (packUnit && unit !== packUnit)
    throw new Error("Owned stock and package size must use compatible units.");
  return { quantity: convertQuantity(owned.quantity, owned.unit, unit), unit };
}
export function duplicateProduct(
  state: FarmState,
  barcode: string | null,
  code?: string | null,
): Product | null {
  for (const value of [barcode, code]) {
    if (!value) continue;
    const matched = matchProductCode(value, state.products);
    if (matched.status === "found") return matched.product;
  }
  return null;
}
export function previewProductDocument(
  state: FarmState,
  raw: ProductDocumentDraft,
): ActionPreview & { stock: ReturnType<typeof resolveOwnedStock> } {
  const parsed = productDocumentDraftSchema.safeParse(raw);
  const issues: ActionPreview["issues"] = [];
  const issue = (field: string, message: string) =>
    issues.push({ field, kind: "invalid", message });
  let stock = null;
  if (!parsed.success)
    issue(
      "draft",
      "The upload draft is incomplete or invalid. Review the file and fields.",
    );
  else {
    const d = parsed.data;
    if (
      d.farmId !== state.farm.id ||
      !state.people.some((p) => p.id === d.actorId)
    )
      issue("actor", "This draft does not belong to the current farm.");
    if (!d.existingProductId && !d.fields.productName)
      issue(
        "productName",
        "Enter a product name or select an existing product.",
      );
    if (
      d.existingProductId &&
      (!productCatalog(state.products).some(
        (p) => p.id === d.existingProductId,
      ) ||
        d.productId !== d.existingProductId)
    )
      issue("productId", "Choose an existing catalog product.");
    if (
      !d.existingProductId &&
      state.products.some((p) => p.id === d.productId)
    )
      issue(
        "productId",
        "This product ID already exists. Select the existing product.",
      );
    for (const code of [d.fields.barcode, d.scannedCode]) {
      const duplicate = duplicateProduct(state, code ?? null);
      if (duplicate && duplicate.id !== d.existingProductId)
        issue(
          "barcode",
          `This code belongs to ${duplicate.name}. Attach to that existing product to avoid a duplicate.`,
        );
    }
    const target = state.products.find((p) => p.id === d.existingProductId);
    if (
      target?.barcode &&
      d.fields.barcode &&
      target.barcode !== d.fields.barcode
    )
      issue(
        "barcode",
        "The barcode differs from the selected product. Choose the correct product.",
      );
    if (
      d.ownedStock &&
      !state.storageLocations.some(
        (s) => s.id === d.ownedStock?.storageLocationId,
      )
    )
      issue(
        "storageLocationId",
        "Choose a storage location for the quantity owned.",
      );
    if (state.documentSources.some((s) => s.id === d.sourceId))
      issue("sourceId", "This source ID already exists.");
    try {
      stock = resolveOwnedStock(d);
    } catch (error) {
      issue(
        "ownedStock",
        error instanceof Error ? error.message : "Invalid owned stock.",
      );
    }
  }
  return {
    draftId: raw.id,
    revision: state.revision,
    valid: issues.length === 0,
    issues,
    impacts: [],
    stock,
  };
}
export function commitProductDocument(
  state: FarmState,
  raw: ProductDocumentDraft,
  confirmation: Confirmation,
  now = new Date().toISOString(),
): FarmState {
  const draft = productDocumentDraftSchema.parse(raw);
  if (!confirmation.approved || confirmation.draftId !== draft.id)
    throw new Error("Explicit confirmation is required.");
  const previous = state.activityLog.find((a) => a.draftId === draft.id);
  if (previous) {
    if (
      previous.action !== draft.kind ||
      !previous.changedRecords.some(
        (r) => r.kind === "documentSource" && r.id === draft.sourceId,
      ) ||
      !previous.changedRecords.some(
        (r) => r.kind === "product" && r.id === draft.productId,
      )
    )
      throw new Error("This draft ID was already used for a different change.");
    return state;
  }
  if (confirmation.expectedRevision !== state.revision)
    throw new Error(
      "Farm records changed. Review the upload again before saving.",
    );
  const preview = previewProductDocument(state, draft);
  if (!preview.valid)
    throw new Error(preview.issues.map((i) => i.message).join(" "));
  const next = structuredClone(state);
  let product = next.products.find((p) => p.id === draft.existingProductId);
  if (!product) {
    const existing = draft.existingProductId
      ? productCatalog(state.products).find(
          (p) => p.id === draft.existingProductId,
        )
      : null;
    product = existing
      ? {
          ...existing,
          documentSourceIds: existing.documentSourceIds.filter((id) =>
            next.documentSources.some((d) => d.id === id),
          ),
        }
      : {
          id: draft.productId,
          farmId: state.farm.id,
          name: draft.fields.productName!,
          kind: draft.fields.category,
          unit: preview.stock?.unit ?? baseUnit(draft.fields.packageUnit),
          documentSourceIds: [],
          manufacturer: draft.fields.manufacturer,
          barcode: draft.fields.barcode,
          batch: draft.fields.batch,
          expiryDate: draft.fields.expiryDate,
        };
    next.products.push(product);
  }
  const code = draft.scannedCode;
  if (code) product.codes = [...new Set([...(product.codes ?? []), code])];
  if (!product.barcode && draft.fields.barcode)
    product.barcode = draft.fields.barcode;
  if (
    !product.packageSize &&
    draft.fields.packageQuantity !== null &&
    draft.fields.packageUnit !== "unknown" &&
    (!product.unit || product.unit === baseUnit(draft.fields.packageUnit))
  )
    product.packageSize = {
      quantity: draft.fields.packageQuantity,
      unit: draft.fields.packageUnit,
    };
  product.documentSourceIds.push(draft.sourceId);
  next.documentSources.push({
    id: draft.sourceId,
    farmId: state.farm.id,
    productId: product.id,
    title: draft.fileName,
    uri: `indexeddb:${draft.fileId}`,
    verification: "userProvided",
    verifiedAt: now,
    verifiedById: draft.actorId,
    uploaded: {
      fileId: draft.fileId,
      fileName: draft.fileName,
      mimeType: draft.mimeType,
      fileSize: draft.fileSize,
      extractionMethod: draft.extractionMethod,
      sourceLanguage: draft.sourceLanguage,
      reviewedFields: draft.fields,
      sections: splitSourceText(
        draft.sourceText,
        draft.sourceId,
        product.id,
        draft.fileName,
        draft.fileId,
        draft.mimeType === "application/pdf",
        draft.sourceLanguage,
      ),
    },
  });
  const changedRecords: FarmState["activityLog"][number]["changedRecords"] = [
    { kind: "product", id: product.id },
    { kind: "documentSource", id: draft.sourceId },
  ];
  if (preview.stock && draft.ownedStock) {
    const balanceId = `balance-${draft.id}`;
    next.inventoryBalances.push({
      id: balanceId,
      farmId: state.farm.id,
      productId: product.id,
      storageLocationId: draft.ownedStock.storageLocationId,
      quantity: preview.stock.quantity,
    });
    const txId = `receipt-${draft.id}`;
    next.inventoryTransactions.push({
      id: txId,
      farmId: state.farm.id,
      draftId: draft.id,
      kind: "receipt",
      inventoryBalanceId: balanceId,
      productId: product.id,
      storageLocationId: draft.ownedStock.storageLocationId,
      operationRecordId: null,
      quantity: preview.stock.quantity,
      before: 0,
      after: preview.stock.quantity,
      createdAt: now,
      recordedById: draft.actorId,
    });
    changedRecords.push(
      { kind: "inventoryBalance", id: balanceId },
      { kind: "inventoryTransaction", id: txId },
    );
  }
  next.activityLog.push({
    id: `activity-${draft.id}`,
    farmId: state.farm.id,
    draftId: draft.id,
    actorId: draft.actorId,
    action: draft.kind,
    changedRecords,
    createdAt: now,
  });
  next.revision++;
  if (!isFarmState(next))
    throw new Error("The reviewed import could not be stored safely.");
  return next;
}
