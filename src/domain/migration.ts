import type { LegacyFarmState } from "./legacy";
import type { FarmState, OperationRecord } from "./types";

// Preserve IDs, custom plans, balances and recorded completions from v1.
// "Today" is not evidence of a calendar date; legacy sowing quantity 0 meant unknown.
export function migrateLegacyState(old: LegacyFarmState): FarmState {
  const farmId = "murat-farm";
  const products = old.stocks.map((s) => ({
    id: "product-" + s.id,
    farmId,
    name: s.name,
    kind: "fertilizer" as const,
    unit: s.unit,
    documentSourceIds: [],
  }));
  const operationRecords: OperationRecord[] = old.jobs
    .filter((t) => t.status === "completed")
    .map((t) => {
      const consumption = old.consumptions.find((c) => c.jobId === t.id);
      return {
        id: "operation-" + (consumption?.operationId ?? t.id),
        farmId,
        draftId: consumption?.operationId ?? "legacy-completion-" + t.id,
        completionId: "completion-" + t.id,
        taskId: t.id,
        fieldId: t.fieldId,
        personId: t.personId,
        assetIds: [...t.machineIds],
        inventoryBalanceId: consumption?.stockId ?? null,
        productId: consumption ? "product-" + consumption.stockId : null,
        actualQuantity: consumption?.quantity ?? null,
        occurredAt: consumption?.createdAt ?? t.completedAt ?? null,
        recordedById: "murat",
      };
    });
  return {
    version: 2,
    revision: old.revision,
    farm: {
      id: farmId,
      name: "Murat’s Farm",
      ownerId: "murat",
      demoUserId: "murat",
    },
    fields: old.fields.map(({ color, ...f }) => ({
      ...f,
      farmId,
      presentation: { visualState: color, iconKey: "field" },
    })),
    people: old.people.map(({ color, ...p }) => ({
      ...p,
      farmId,
      presentation: { visualState: color, iconKey: "person" },
    })),
    storageLocations: old.warehouses.map((w) => ({
      ...w,
      farmId,
      presentation: { iconKey: "warehouse" },
    })),
    products,
    inventoryBalances: old.stocks.map((s) => ({
      id: s.id,
      farmId,
      productId: "product-" + s.id,
      storageLocationId: s.warehouseId,
      quantity: s.quantity,
    })),
    assets: old.machines.map((m) => ({
      ...m,
      farmId,
      availability: "available",
      presentation: { iconKey: m.kind },
    })),
    tasks: old.jobs.map((t) => ({
      id: t.id,
      farmId,
      title: t.title,
      fieldId: t.fieldId,
      personId: t.personId,
      assetIds: [...t.machineIds],
      inventoryBalanceId: t.stockId ?? null,
      productId: t.stockId ? "product-" + t.stockId : null,
      plannedQuantity: t.stockId ? t.plannedQuantity : null,
      type: t.type,
      status: t.status,
      dependencyId: t.dependencyId ?? null,
      schedule: { date: null, startTime: null, endTime: null },
      scheduleLabel: t.scheduled,
      completedAt: t.completedAt ?? null,
    })),
    operationRecords,
    inventoryTransactions: old.consumptions.map((c) => ({
      id: c.id,
      farmId,
      draftId: c.operationId,
      kind: "consumption",
      inventoryBalanceId: c.stockId,
      productId: "product-" + c.stockId,
      storageLocationId: old.stocks.find((s) => s.id === c.stockId)!
        .warehouseId,
      operationRecordId: operationRecords.find((o) => o.taskId === c.jobId)!.id,
      quantity: c.quantity,
      before: c.before,
      after: c.after,
      createdAt: c.createdAt,
      recordedById: "murat",
    })),
    activityLog: operationRecords.map((o) => ({
      id: "activity-" + o.draftId,
      farmId,
      draftId: o.draftId,
      actorId: "murat",
      action: "legacyMigration",
      changedRecords: [
        { kind: "task", id: o.taskId },
        { kind: "operationRecord", id: o.id },
      ],
      createdAt: o.occurredAt,
    })),
    documentSources: [],
  };
}
