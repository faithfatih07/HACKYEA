import { isQuantity } from "./quantity";
import type { FarmState, Schedule, Task } from "./types";
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const id = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const text = (v: unknown): v is string => typeof v === "string";
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(id) && new Set(v).size === v.length;
const nullableId = (v: unknown) => v === null || id(v);
export const isTimestamp = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function isSchedule(v: unknown): v is Schedule {
  if (!isRecord(v)) return false;
  const date = v.date,
    start = v.startTime,
    end = v.endTime;
  if (
    date !== null &&
    (!text(date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    return false;
  const time = (t: unknown) =>
    t === null || (text(t) && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  return (
    time(start) &&
    time(end) &&
    (start === null || end === null || String(start) < String(end)) &&
    (date !== null || (start === null && end === null))
  );
}
export function validTask(state: FarmState, task: Task) {
  return (
    isRecord(task) &&
    id(task.id) &&
    task.farmId === state.farm.id &&
    text(task.title) &&
    task.title.trim().length > 0 &&
    state.fields.some((f) => f.id === task.fieldId) &&
    state.people.some((p) => p.id === task.personId) &&
    ids(task.assetIds) &&
    task.assetIds.every((a) => state.assets.some((asset) => asset.id === a)) &&
    nullableId(task.inventoryBalanceId) &&
    nullableId(task.productId) &&
    (task.inventoryBalanceId === null
      ? task.productId === null ||
        state.products.some((p) => p.id === task.productId)
      : state.inventoryBalances.some(
          (b) =>
            b.id === task.inventoryBalanceId && b.productId === task.productId,
        )) &&
    (task.plannedQuantity === null || isQuantity(task.plannedQuantity)) &&
    ["planned", "completed"].includes(task.status) &&
    (task.serviceOfferId == null ||
      (state.serviceOffers ?? []).some(
        (o) => o.id === task.serviceOfferId && o.taskId === task.id,
      )) &&
    (task.lastFailureReason == null || text(task.lastFailureReason)) &&
    ["fertilizing", "sowing"].includes(task.type) &&
    nullableId(task.dependencyId) &&
    task.dependencyId !== task.id &&
    (!task.dependencyId ||
      state.tasks.some((t) => t.id === task.dependencyId)) &&
    isSchedule(task.schedule) &&
    text(task.scheduleLabel) &&
    (task.completedAt === null || isTimestamp(task.completedAt))
  );
}
export function isFarmState(value: unknown): value is FarmState {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !isRecord(value.farm) ||
    !id(value.farm.id) ||
    !text(value.farm.name)
  )
    return false;
  const keys = [
    "fields",
    "people",
    "storageLocations",
    "products",
    "inventoryBalances",
    "inventoryTransactions",
    "assets",
    "tasks",
    "operationRecords",
    "documentSources",
    "activityLog",
  ] as const;
  const farmId = value.farm.id;
  for (const key of keys) {
    const items = value[key];
    if (
      !Array.isArray(items) ||
      !items.every((e) => isRecord(e) && id(e.id) && e.farmId === farmId) ||
      new Set(items.map((e) => e.id)).size !== items.length
    )
      return false;
  }
  const s = value as unknown as FarmState;
  if (
    !s.people.some((p) => p.id === s.farm.ownerId) ||
    !s.people.some((p) => p.id === s.farm.demoUserId)
  )
    return false;
  if (
    !s.fields.every(
      (f) =>
        text(f.name) &&
        typeof f.area === "number" &&
        Number.isFinite(f.area) &&
        f.area >= 0 &&
        text(f.crop) &&
        ["Planned", "Growing"].includes(f.stage),
    )
  )
    return false;
  if (
    !s.people.every(
      (p) =>
        text(p.name) &&
        text(p.role) &&
        text(p.initials) &&
        (p.availability === undefined ||
          ["available", "unavailable", "unknown"].includes(p.availability)),
    )
  )
    return false;
  if (
    !s.assets.every(
      (a) =>
        text(a.name) &&
        text(a.note) &&
        ["tractor", "spreader", "seeder", "trailer"].includes(a.kind) &&
        ["available", "broken", "unavailable", "unknown"].includes(
          a.availability,
        ) &&
        (a.repairExpectedAt == null || isTimestamp(a.repairExpectedAt)),
    )
  )
    return false;
  if (
    !s.storageLocations.every(
      (w) =>
        text(w.name) &&
        text(w.description) &&
        s.people.some((p) => p.id === w.personId),
    )
  )
    return false;
  if (
    !s.products.every(
      (p) =>
        text(p.name) &&
        (p.unitPrice == null ||
          (isQuantity(p.unitPrice) &&
            text(p.currency) &&
            p.currency.length > 0)) &&
        ["fertilizer", "pesticide", "seed", "fuel"].includes(p.kind) &&
        ["kg", "l"].includes(p.unit) &&
        ids(p.documentSourceIds) &&
        p.documentSourceIds.every((d) =>
          s.documentSources.some(
            (doc) => doc.id === d && doc.productId === p.id,
          ),
        ),
    )
  )
    return false;
  if (
    !s.inventoryBalances.every(
      (b) =>
        (b.quantity === null || isQuantity(b.quantity)) &&
        s.products.some((p) => p.id === b.productId) &&
        s.storageLocations.some((w) => w.id === b.storageLocationId),
    ) ||
    new Set(
      s.inventoryBalances.map((b) => b.productId + "/" + b.storageLocationId),
    ).size !== s.inventoryBalances.length
  )
    return false;
  if (!s.tasks.every((t) => validTask(s, t))) return false;
  // Reject dependency cycles instead of leaving tasks permanently blocked.
  for (const task of s.tasks) {
    const seen = new Set<string>([task.id]);
    let parent = task.dependencyId;
    while (parent) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      parent = s.tasks.find((t) => t.id === parent)!.dependencyId;
    }
  }
  if (
    !s.operationRecords.every(
      (o) =>
        (o.outcome === undefined ||
          ["completed", "notCompleted"].includes(o.outcome)) &&
        (o.outcome !== "notCompleted" || o.actualQuantity === null) &&
        id(o.draftId) &&
        id(o.completionId) &&
        s.tasks.some(
          (t) =>
            t.id === o.taskId &&
            (o.outcome === "notCompleted" || t.status === "completed") &&
            t.fieldId === o.fieldId,
        ) &&
        s.people.some((p) => p.id === o.personId) &&
        s.people.some((p) => p.id === o.recordedById) &&
        ids(o.assetIds) &&
        o.assetIds.every((a) => s.assets.some((asset) => asset.id === a)) &&
        nullableId(o.productId) &&
        nullableId(o.inventoryBalanceId) &&
        (o.inventoryBalanceId === null
          ? o.productId === null
          : s.inventoryBalances.some(
              (b) =>
                b.id === o.inventoryBalanceId && b.productId === o.productId,
            )) &&
        (o.actualQuantity === null ||
          (isQuantity(o.actualQuantity) && o.actualQuantity > 0)) &&
        (o.occurredAt === null || isTimestamp(o.occurredAt)),
    )
  )
    return false;
  for (const key of ["draftId", "completionId", "taskId"] as const)
    if (
      new Set(
        s.operationRecords
          .filter((o) => key !== "taskId" || o.outcome !== "notCompleted")
          .map((o) => o[key]),
      ).size !==
      s.operationRecords.filter(
        (o) => key !== "taskId" || o.outcome !== "notCompleted",
      ).length
    )
      return false;
  if (
    s.tasks.some(
      (t) =>
        t.status === "completed" &&
        !s.operationRecords.some(
          (o) => o.taskId === t.id && o.outcome !== "notCompleted",
        ),
    )
  )
    return false;
  if (
    !s.inventoryTransactions.every(
      (tx) =>
        id(tx.draftId) &&
        ["receipt", "consumption", "correction", "return"].includes(tx.kind) &&
        isQuantity(tx.quantity) &&
        tx.quantity > 0 &&
        isQuantity(tx.before) &&
        isQuantity(tx.after) &&
        s.inventoryBalances.some(
          (b) =>
            b.id === tx.inventoryBalanceId &&
            b.productId === tx.productId &&
            b.storageLocationId === tx.storageLocationId,
        ) &&
        s.people.some((p) => p.id === tx.recordedById) &&
        isTimestamp(tx.createdAt) &&
        (tx.kind === "consumption"
          ? Math.abs(tx.before - tx.quantity - tx.after) < 0.000001 &&
            s.operationRecords.some(
              (o) =>
                o.id === tx.operationRecordId &&
                o.draftId === tx.draftId &&
                o.inventoryBalanceId === tx.inventoryBalanceId &&
                o.actualQuantity === tx.quantity,
            )
          : tx.operationRecordId === null &&
            (tx.kind === "correction"
              ? Math.abs(Math.abs(tx.after - tx.before) - tx.quantity) <
                0.000001
              : Math.abs(tx.before + tx.quantity - tx.after) < 0.000001)),
    )
  )
    return false;
  if (
    new Set(s.inventoryTransactions.map((tx) => tx.draftId)).size !==
    s.inventoryTransactions.length
  )
    return false;
  for (const op of s.operationRecords) {
    if (
      op.actualQuantity !== null &&
      s.inventoryTransactions.filter((tx) => tx.operationRecordId === op.id)
        .length !== 1
    )
      return false;
  }
  for (const balance of s.inventoryBalances) {
    const txs = s.inventoryTransactions.filter(
      (tx) => tx.inventoryBalanceId === balance.id,
    );
    if (
      txs.length &&
      (balance.quantity !== txs.at(-1)!.after ||
        txs.some((tx, i) => i > 0 && tx.before !== txs[i - 1].after))
    )
      return false;
  }
  if (
    !s.documentSources.every(
      (d) =>
        text(d.title) &&
        text(d.uri) &&
        d.verification === "verified" &&
        isTimestamp(d.verifiedAt) &&
        s.people.some((p) => p.id === d.verifiedById) &&
        (d.productId === null || s.products.some((p) => p.id === d.productId)),
    )
  )
    return false;
  if (
    s.serviceOffers !== undefined &&
    (!Array.isArray(s.serviceOffers) ||
      !s.serviceOffers.every(isRecord) ||
      new Set(s.serviceOffers.map((o) => o.id)).size !==
        s.serviceOffers.length ||
      !s.serviceOffers.every(
        (o) =>
          isRecord(o) &&
          id(o.id) &&
          o.farmId === s.farm.id &&
          text(o.name) &&
          text(o.currency) &&
          o.currency.length > 0 &&
          s.tasks.some((t) => t.id === o.taskId) &&
          [o.price, o.transportCost, o.durationHours].every(
            (v) => v === null || isQuantity(v),
          ),
      ))
  )
    return false;
  const refs: Record<string, { id: string }[]> = {
    farm: [s.farm],
    field: s.fields,
    person: s.people,
    asset: s.assets,
    task: s.tasks,
    storageLocation: s.storageLocations,
    product: s.products,
    inventoryBalance: s.inventoryBalances,
    inventoryTransaction: s.inventoryTransactions,
    operationRecord: s.operationRecords,
    documentSource: s.documentSources,
    serviceOffer: s.serviceOffers ?? [],
  };
  if (
    !s.activityLog.every(
      (a) =>
        id(a.draftId) &&
        s.people.some((p) => p.id === a.actorId) &&
        [
          "recordConsumption",
          "completeTask",
          "createTask",
          "setAssetAvailability",
          "rescheduleTask",
          "setPersonAvailability",
          "assignTaskPerson",
          "assignTaskAssets",
          "changeTaskMaterial",
          "correctInventory",
          "failTask",
          "linkServiceOffer",
          "legacyMigration",
        ].includes(a.action) &&
        (a.createdAt === null || isTimestamp(a.createdAt)) &&
        Array.isArray(a.changedRecords) &&
        a.changedRecords.every(
          (r) =>
            isRecord(r) &&
            Object.hasOwn(refs, r.kind) &&
            refs[r.kind].some((e) => e.id === r.id),
        ),
    )
  )
    return false;
  return (
    new Set(s.activityLog.map((a) => a.draftId)).size ===
      s.activityLog.length &&
    s.operationRecords.every((o) =>
      s.activityLog.some((a) => a.draftId === o.draftId),
    )
  );
}
