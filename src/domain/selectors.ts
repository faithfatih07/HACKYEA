import { roundKg } from "./quantity";
import type { FarmState, Task } from "./types";

export function isTaskBlocked(state: FarmState, task: Task) {
  return Boolean(
    task.dependencyId &&
    state.tasks.find((t) => t.id === task.dependencyId)?.status !== "completed",
  );
}
export function plannedDemand(
  state: FarmState,
  balanceId: string,
  excludedTaskId?: string,
) {
  const tasks = state.tasks.filter(
    (t) =>
      t.status === "planned" &&
      t.inventoryBalanceId === balanceId &&
      t.id !== excludedTaskId,
  );
  return {
    taskIds: tasks.map((t) => t.id),
    knownQuantity: roundKg(
      tasks.reduce((sum, t) => sum + (t.plannedQuantity ?? 0), 0),
    ),
    unknownTaskIds: tasks
      .filter((t) => t.plannedQuantity === null)
      .map((t) => t.id),
    total: tasks.some((t) => t.plannedQuantity === null)
      ? null
      : roundKg(tasks.reduce((sum, t) => sum + t.plannedQuantity!, 0)),
  };
}
export function inventorySummary(state: FarmState, balanceId: string) {
  const demand = plannedDemand(state, balanceId);
  const balance = state.inventoryBalances.find((b) => b.id === balanceId);
  const missing =
    balance && balance.quantity !== null && demand.total !== null
      ? roundKg(Math.max(0, demand.total - balance.quantity))
      : null;
  return { demand, missing };
}
export function hasUnknownPlanning(state: FarmState) {
  return (
    state.inventoryBalances.some((b) => b.quantity === null) ||
    state.tasks.some(
      (t) => t.status === "planned" && t.plannedQuantity === null,
    )
  );
}
// Read-only projections keep existing list/detail routes intact. Never persist these copies.
export function selectFarmView(state: FarmState) {
  return {
    domain: state,
    revision: state.revision,
    fields: state.fields.map((f) => ({
      ...f,
      color: f.presentation?.visualState ?? "wheat",
    })),
    people: state.people.map((p) => ({
      ...p,
      color: p.presentation?.visualState ?? "green",
    })),
    machines: state.assets,
    warehouses: state.storageLocations,
    stocks: state.inventoryBalances.map((b) => ({
      ...b,
      name: state.products.find((p) => p.id === b.productId)?.name ?? "",
      unit: state.products.find((p) => p.id === b.productId)?.unit ?? "kg",
      warehouseId: b.storageLocationId,
    })),
    jobs: state.tasks.map((t) => ({
      ...t,
      machineIds: t.assetIds,
      stockId: t.inventoryBalanceId ?? undefined,
      dependencyId: t.dependencyId ?? undefined,
      scheduled: t.scheduleLabel,
      completedAt: t.completedAt ?? undefined,
    })),
    consumptions: state.inventoryTransactions.flatMap((tx) => {
      const op = state.operationRecords.find(
        (o) => o.id === tx.operationRecordId,
      );
      return tx.kind === "consumption" && op
        ? [
            {
              id: tx.id,
              operationId: op.draftId,
              jobId: op.taskId,
              fieldId: op.fieldId,
              stockId: tx.inventoryBalanceId,
              quantity: tx.quantity,
              before: tx.before,
              after: tx.after,
              createdAt: tx.createdAt,
            },
          ]
        : [];
    }),
  };
}
export type FarmView = ReturnType<typeof selectFarmView>;
export type Job = FarmView["jobs"][number];
export type StateInput = FarmState | FarmView;
export const domainState = (state: StateInput): FarmState =>
  "domain" in state ? state.domain : state;
