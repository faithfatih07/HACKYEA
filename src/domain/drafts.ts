import { createId } from "./id";
import { nextMonday } from "./schedule";
import type { ActionDraft, FarmState } from "./types";

export function createChangeDraft(
  state: FarmState,
  kind: ActionDraft["kind"],
  targetId: string,
): ActionDraft {
  const base = {
    id: createId(),
    farmId: state.farm.id,
    actorId: state.farm.demoUserId,
  };
  const task = state.tasks.find((t) => t.id === targetId);
  switch (kind) {
    case "setAssetAvailability":
      return { ...base, kind, assetId: targetId, availability: "broken" };
    case "setPersonAvailability":
      return { ...base, kind, personId: targetId, availability: "unavailable" };
    case "rescheduleTask":
      return {
        ...base,
        kind,
        taskId: targetId,
        schedule: { date: nextMonday(), startTime: null, endTime: null },
      };
    case "assignTaskPerson":
      return {
        ...base,
        kind,
        taskId: targetId,
        personId: task?.personId ?? null,
      };
    case "assignTaskAssets":
      return {
        ...base,
        kind,
        taskId: targetId,
        assetIds: [...(task?.assetIds ?? [])],
      };
    case "changeTaskMaterial":
      return {
        ...base,
        kind,
        taskId: targetId,
        inventoryBalanceId: task?.inventoryBalanceId ?? null,
        productId: task?.productId ?? null,
        plannedQuantity: task?.plannedQuantity ?? null,
      };
    case "correctInventory":
      return {
        ...base,
        kind,
        inventoryBalanceId: targetId,
        countedQuantity: null,
      };
    case "completeTask":
      return {
        ...base,
        kind,
        taskId: targetId,
        completionId: "completion-" + targetId,
      };
    case "failTask":
      return { ...base, kind, taskId: targetId, reason: null };
    case "linkServiceOffer":
      return { ...base, kind, taskId: targetId, serviceOfferId: null };
    default:
      throw new Error(
        "Use the existing planning or completion form for this action.",
      );
  }
}
