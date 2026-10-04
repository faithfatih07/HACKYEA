import { domainMessage } from "../i18n/messages";
import { calculateImpacts } from "./impacts";
import { isTaskBlocked } from "./selectors";
import { isQuantity, roundKg } from "./quantity";
import {
  isFarmState,
  isRecord,
  isSchedule,
  isTimestamp,
  validTask,
} from "./validation";
import type {
  ActionDraft,
  ActionPreview,
  Confirmation,
  EntityReference,
  FarmState,
  OperationRecord,
  ValidationIssue,
} from "./types";

// This shape guard is the trust boundary for future backend/model proposals.
export function isActionDraft(value: unknown): value is ActionDraft {
  if (
    !isRecord(value) ||
    ![value.id, value.farmId, value.actorId].every(
      (v) => typeof v === "string" && v.trim(),
    )
  )
    return false;
  const nullableId = (v: unknown) =>
    v === null || (typeof v === "string" && v.length > 0);
  switch (value.kind) {
    case "recordConsumption":
      return (
        typeof value.completionId === "string" &&
        value.completionId.length > 0 &&
        [
          value.taskId,
          value.fieldId,
          value.productId,
          value.inventoryBalanceId,
        ].every(nullableId) &&
        (value.actualQuantity === null ||
          typeof value.actualQuantity === "number")
      );
    case "completeTask":
      return (
        typeof value.completionId === "string" &&
        value.completionId.length > 0 &&
        nullableId(value.taskId)
      );
    case "createTask":
      return isRecord(value.task);
    case "setAssetAvailability":
      return (
        nullableId(value.assetId) &&
        ["available", "unavailable", "unknown"].includes(
          String(value.availability),
        )
      );
    case "rescheduleTask":
      return nullableId(value.taskId) && isSchedule(value.schedule);
    default:
      return false;
  }
}
export function previewAction(
  state: FarmState,
  draft: ActionDraft,
): ActionPreview {
  const issues: ValidationIssue[] = [];
  const issue = (
    field: string,
    key: Parameters<typeof domainMessage>[0],
    kind: ValidationIssue["kind"] = "invalid",
    values: Record<string, unknown> = {},
  ) => issues.push({ field, kind, message: domainMessage(key, values) });
  if (!isActionDraft(draft)) {
    issue("draft", "errorInvalidDraft");
    return {
      draftId: "",
      revision: state.revision,
      valid: false,
      issues,
      impacts: [],
    };
  }
  if (
    draft.farmId !== state.farm.id ||
    !state.people.some((p) => p.id === draft.actorId)
  )
    issue("actorId", "errorDraftActor");
  const task =
    "taskId" in draft
      ? state.tasks.find((t) => t.id === draft.taskId)
      : undefined;
  if (
    draft.kind === "recordConsumption" ||
    draft.kind === "completeTask" ||
    draft.kind === "rescheduleTask"
  ) {
    if (!task) issue("taskId", "errorChooseJob", "missing");
    else {
      if (task.status !== "planned")
        issue("taskId", "errorAlreadyComplete", "blocked");
      if (draft.kind !== "rescheduleTask" && isTaskBlocked(state, task))
        issue("taskId", "errorPrerequisite", "blocked");
    }
  }
  if (draft.kind === "recordConsumption") {
    const balance = state.inventoryBalances.find(
      (b) => b.id === draft.inventoryBalanceId,
    );
    if (!state.fields.some((f) => f.id === draft.fieldId))
      issue("fieldId", "errorChooseField", "missing");
    if (!balance) issue("inventoryBalanceId", "errorChooseMaterial", "missing");
    if (
      !state.products.some((p) => p.id === draft.productId) ||
      (balance && balance.productId !== draft.productId)
    )
      issue("productId", "errorJobMaterial");
    if (task) {
      if (task.type !== "fertilizing") issue("taskId", "errorOnlyFertilizing");
      if (task.fieldId !== draft.fieldId) issue("fieldId", "errorJobField");
      if (
        task.inventoryBalanceId !== draft.inventoryBalanceId ||
        task.productId !== draft.productId
      )
        issue("inventoryBalanceId", "errorJobMaterial");
    }
    if (
      draft.actualQuantity === null ||
      !isQuantity(draft.actualQuantity) ||
      draft.actualQuantity <= 0
    )
      issue(
        "actualQuantity",
        "errorAmount",
        draft.actualQuantity === null ? "missing" : "invalid",
      );
    else if (balance) {
      if (balance.quantity === null)
        issue("inventoryBalanceId", "errorUnknownStock", "blocked");
      else if (draft.actualQuantity > balance.quantity)
        issue("actualQuantity", "errorAvailable", "blocked", {
          quantity: balance.quantity,
        });
    }
  } else if (draft.kind === "completeTask") {
    if (task?.type !== "sowing") issue("taskId", "errorChooseSowing");
  } else if (draft.kind === "createTask") {
    if (
      !validTask(state, draft.task) ||
      draft.task.status !== "planned" ||
      draft.task.completedAt !== null
    )
      issue("task", "errorInvalidTask");
    if (
      draft.task.type === "fertilizing" &&
      (draft.task.plannedQuantity === null || draft.task.plannedQuantity <= 0)
    )
      issue("plannedQuantity", "errorPlannedAmount", "missing");
    if (
      draft.task.type === "fertilizing" &&
      (!Array.isArray(draft.task.assetIds) || !draft.task.assetIds.length)
    )
      issue("assetIds", "errorChooseMachine", "missing");
    if (state.tasks.some((t) => t.id === draft.task.id))
      issue("task.id", "errorDuplicateTask");
  } else if (draft.kind === "setAssetAvailability") {
    if (!state.assets.some((a) => a.id === draft.assetId))
      issue("assetId", "errorChooseMachine", "missing");
  } else if (draft.kind === "rescheduleTask") {
    if (!isSchedule(draft.schedule)) issue("schedule", "errorSchedule");
  }
  // Invalid external task shapes must not reach the effect calculator.
  const impacts =
    draft.kind === "createTask" && !validTask(state, draft.task)
      ? []
      : calculateImpacts(state, draft);
  return {
    draftId: draft.id,
    revision: state.revision,
    valid: issues.length === 0,
    issues,
    impacts,
  };
}

// Pure, atomic domain transaction. Persistence is the repository's responsibility.
export function commitAction(
  state: FarmState,
  draft: ActionDraft,
  confirmation: Confirmation,
  now = new Date().toISOString(),
): FarmState {
  if (!isActionDraft(draft))
    throw new Error(domainMessage("errorInvalidDraft"));
  if (confirmation.approved !== true || confirmation.draftId !== draft.id)
    throw new Error(domainMessage("errorConfirmationRequired"));
  // Domain-level idempotency survives refreshes and different clients.
  if (state.activityLog.some((a) => a.draftId === draft.id)) return state;
  if ("completionId" in draft) {
    const existing = state.operationRecords.find(
      (o) => o.completionId === draft.completionId || o.taskId === draft.taskId,
    );
    if (existing) {
      if (existing.taskId !== draft.taskId)
        throw new Error(domainMessage("errorCompletionConflict"));
      return state;
    }
  }
  if (state.revision !== confirmation.expectedRevision)
    throw new Error(domainMessage("errorStale"));
  const preview = previewAction(state, draft);
  if (!preview.valid)
    throw new Error(preview.issues.map((i) => i.message).join(" "));
  if (!isTimestamp(now)) throw new Error(domainMessage("errorInvalidDraft"));
  let next: FarmState = { ...state, revision: state.revision + 1 };
  const refs: EntityReference[] = [];
  if (draft.kind === "recordConsumption" || draft.kind === "completeTask") {
    const task = state.tasks.find((t) => t.id === draft.taskId)!;
    const consuming = draft.kind === "recordConsumption";
    const operation: OperationRecord = {
      id: "operation-" + draft.id,
      farmId: state.farm.id,
      draftId: draft.id,
      completionId: draft.completionId,
      taskId: task.id,
      fieldId: task.fieldId,
      personId: task.personId,
      assetIds: [...task.assetIds],
      productId: consuming ? draft.productId : null,
      inventoryBalanceId: consuming ? draft.inventoryBalanceId : null,
      actualQuantity: consuming ? draft.actualQuantity : null,
      occurredAt: now,
      recordedById: draft.actorId,
    };
    next = {
      ...next,
      tasks: state.tasks.map((t) =>
        t.id === task.id ? { ...t, status: "completed", completedAt: now } : t,
      ),
      operationRecords: [...state.operationRecords, operation],
    };
    refs.push(
      { kind: "task", id: task.id },
      { kind: "operationRecord", id: operation.id },
    );
    if (draft.kind === "recordConsumption") {
      const balance = state.inventoryBalances.find(
        (b) => b.id === draft.inventoryBalanceId,
      )!;
      const after = roundKg(balance.quantity! - draft.actualQuantity!);
      const transaction = {
        id: "consumption-" + draft.id,
        farmId: state.farm.id,
        draftId: draft.id,
        kind: "consumption" as const,
        inventoryBalanceId: balance.id,
        productId: balance.productId,
        storageLocationId: balance.storageLocationId,
        operationRecordId: operation.id,
        quantity: draft.actualQuantity!,
        before: balance.quantity!,
        after,
        createdAt: now,
        recordedById: draft.actorId,
      };
      next = {
        ...next,
        inventoryBalances: state.inventoryBalances.map((b) =>
          b.id === balance.id ? { ...b, quantity: after } : b,
        ),
        inventoryTransactions: [...state.inventoryTransactions, transaction],
      };
      refs.push(
        { kind: "inventoryBalance", id: balance.id },
        { kind: "inventoryTransaction", id: transaction.id },
      );
    }
  } else if (draft.kind === "createTask") {
    next = { ...next, tasks: [...state.tasks, structuredClone(draft.task)] };
    refs.push({ kind: "task", id: draft.task.id });
  } else if (draft.kind === "setAssetAvailability") {
    next = {
      ...next,
      assets: state.assets.map((a) =>
        a.id === draft.assetId ? { ...a, availability: draft.availability } : a,
      ),
    };
    refs.push({ kind: "asset", id: draft.assetId! });
  } else {
    next = {
      ...next,
      tasks: state.tasks.map((t) =>
        t.id === draft.taskId
          ? {
              ...t,
              schedule: { ...draft.schedule },
              scheduleLabel: draft.schedule.date ?? "Schedule unknown",
            }
          : t,
      ),
    };
    refs.push({ kind: "task", id: draft.taskId! });
  }
  next = {
    ...next,
    activityLog: [
      ...state.activityLog,
      {
        id: "activity-" + draft.id,
        farmId: state.farm.id,
        draftId: draft.id,
        actorId: draft.actorId,
        action: draft.kind,
        changedRecords: refs,
        createdAt: now,
      },
    ],
  };
  if (!isFarmState(next)) throw new Error(domainMessage("errorInvalidDraft"));
  return next;
}
