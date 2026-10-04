import { plannedDemand, isTaskBlocked } from "./selectors";
import { roundKg } from "./quantity";
import type {
  ActionDraft,
  EntityReference,
  FarmState,
  Impact,
  Task,
} from "./types";

export function calculateImpacts(
  state: FarmState,
  draft: ActionDraft,
): Impact[] {
  const impacts: Impact[] = [];
  const add = (
    classification: Impact["classification"],
    kind: Impact["kind"],
    messageKey: string,
    values: Impact["values"],
    records: EntityReference[],
  ) => {
    impacts.push({
      id: draft.id + "-impact-" + impacts.length,
      classification,
      kind,
      messageKey,
      values,
      records,
    });
  };
  if (draft.kind === "createTask" && draft.task.inventoryBalanceId) {
    const balance = state.inventoryBalances.find(
      (b) => b.id === draft.task.inventoryBalanceId,
    );
    if (balance) {
      const demand = plannedDemand(
        { ...state, tasks: [...state.tasks, draft.task] },
        balance.id,
      );
      const refs: EntityReference[] = [
        { kind: "inventoryBalance", id: balance.id },
        ...demand.taskIds.map((id) => ({ kind: "task" as const, id })),
      ];
      add(
        balance.quantity === null ? "unknown" : "confirmed",
        "remainingStock",
        balance.quantity === null ? "impactStockUnknown" : "impactPlanStock",
        balance.quantity === null ? {} : { available: balance.quantity },
        refs,
      );
      add(
        demand.total === null ? "unknown" : "confirmed",
        "plannedDemand",
        demand.total === null ? "impactDemandUnknown" : "impactPlannedDemand",
        demand.total === null
          ? { known: demand.knownQuantity }
          : { required: demand.total },
        refs,
      );
      if (balance.quantity !== null && demand.knownQuantity > balance.quantity)
        add(
          "warning",
          "shortage",
          "impactShortage",
          { missing: roundKg(demand.knownQuantity - balance.quantity) },
          refs,
        );
    }
  }
  if (draft.kind === "recordConsumption") {
    const balance = state.inventoryBalances.find(
      (b) => b.id === draft.inventoryBalanceId,
    );
    if (balance) {
      const refs: EntityReference[] = [
        { kind: "inventoryBalance", id: balance.id },
        { kind: "product", id: balance.productId },
      ];
      const after =
        balance.quantity !== null && draft.actualQuantity !== null
          ? roundKg(balance.quantity - draft.actualQuantity)
          : null;
      if (after !== null)
        add(
          "confirmed",
          "remainingStock",
          "impactRemainingStock",
          { before: balance.quantity!, used: draft.actualQuantity!, after },
          refs,
        );
      else add("unknown", "remainingStock", "impactStockUnknown", {}, refs);
      const demand = plannedDemand(
        state,
        balance.id,
        draft.taskId ?? undefined,
      );
      const taskRefs: EntityReference[] = demand.taskIds.map((id) => ({
        kind: "task",
        id,
      }));
      if (demand.total !== null)
        add(
          "confirmed",
          "plannedDemand",
          "impactPlannedDemand",
          { required: demand.total },
          [...refs, ...taskRefs],
        );
      else
        add(
          "unknown",
          "plannedDemand",
          "impactDemandUnknown",
          { known: demand.knownQuantity },
          [...refs, ...taskRefs],
        );
      if (after !== null && after >= 0 && demand.knownQuantity > after)
        add(
          "warning",
          "shortage",
          "impactShortage",
          { missing: roundKg(demand.knownQuantity - after) },
          [...refs, ...taskRefs],
        );
    }
  }
  if (draft.kind === "setAssetAvailability") {
    const asset = state.assets.find((a) => a.id === draft.assetId);
    if (asset && draft.availability !== "available") {
      for (const task of state.tasks.filter(
        (t) => t.status === "planned" && t.assetIds.includes(asset.id),
      ))
        add(
          draft.availability === "unavailable" ? "warning" : "unknown",
          "assetUnavailable",
          "impactAssetUnavailable",
          {
            asset: asset.name,
            assetId: asset.id,
            task: task.title,
            taskId: task.id,
          },
          [
            { kind: "asset", id: asset.id },
            { kind: "task", id: task.id },
          ],
        );
    }
    return impacts;
  }
  let task: Task | undefined;
  if (draft.kind === "createTask") task = draft.task;
  else if ("taskId" in draft)
    task = state.tasks.find((t) => t.id === draft.taskId);
  if (!task) return impacts;
  if (draft.kind === "rescheduleTask")
    task = { ...task, schedule: draft.schedule };
  const taskRef: EntityReference = { kind: "task", id: task.id };
  if (isTaskBlocked(state, task))
    add(
      "warning",
      "dependency",
      "impactDependency",
      { task: task.title, taskId: task.id },
      [taskRef, { kind: "task", id: task.dependencyId! }],
    );
  for (const assetId of task.assetIds) {
    const asset = state.assets.find((a) => a.id === assetId);
    if (asset && asset.availability !== "available")
      add(
        asset.availability === "unavailable" ? "warning" : "unknown",
        "assetUnavailable",
        "impactAssetUnavailable",
        {
          asset: asset.name,
          assetId: asset.id,
          task: task.title,
          taskId: task.id,
        },
        [taskRef, { kind: "asset", id: asset.id }],
      );
  }
  for (const other of state.tasks.filter(
    (t) => t.status === "planned" && t.id !== task!.id,
  )) {
    const personConflict = other.personId === task.personId;
    const assetIds = task.assetIds.filter((id) => other.assetIds.includes(id));
    if (!personConflict && !assetIds.length) continue;
    const refs: EntityReference[] = [
      taskRef,
      { kind: "task", id: other.id },
      ...assetIds.map((id) => ({ kind: "asset" as const, id })),
      ...(personConflict
        ? [{ kind: "person" as const, id: task.personId }]
        : []),
    ];
    const a = task.schedule,
      b = other.schedule;
    // Different known dates cannot overlap. Unknown dates/hours are never guessed.
    if (a.date && b.date && a.date !== b.date) continue;
    if (
      !a.date ||
      !b.date ||
      !a.startTime ||
      !a.endTime ||
      !b.startTime ||
      !b.endTime
    ) {
      add(
        "unknown",
        "scheduleUnknown",
        "impactScheduleUnknown",
        { task: other.title, taskId: other.id },
        refs,
      );
    } else if (a.startTime < b.endTime && b.startTime < a.endTime) {
      add(
        "warning",
        "resourceConflict",
        "impactResourceConflict",
        { task: other.title, taskId: other.id, date: a.date },
        refs,
      );
    }
  }
  if (draft.kind === "rescheduleTask") {
    for (const dependent of state.tasks.filter(
      (t) => t.status === "planned" && t.dependencyId === task!.id,
    )) {
      const known = Boolean(
        task.schedule.date &&
        dependent.schedule.date &&
        (task.schedule.date !== dependent.schedule.date ||
          (task.schedule.endTime && dependent.schedule.startTime)),
      );
      const earlier =
        known &&
        (dependent.schedule.date! < task.schedule.date! ||
          (dependent.schedule.date === task.schedule.date &&
            dependent.schedule.startTime &&
            task.schedule.endTime &&
            dependent.schedule.startTime < task.schedule.endTime));
      add(
        !known ? "unknown" : earlier ? "warning" : "confirmed",
        "dependentSchedule",
        !known
          ? "impactDependentUnknown"
          : earlier
            ? "impactDependentBefore"
            : "impactDependentSchedule",
        { task: dependent.title, taskId: dependent.id },
        [taskRef, { kind: "task", id: dependent.id }],
      );
    }
  }
  return impacts;
}
