import { domainMessage } from "../i18n/messages";
import { commitAction, previewAction } from "./actions";
import { domainState, plannedDemand, selectFarmView } from "./selectors";
import type { StateInput } from "./selectors";
import { parseQuantity, roundKg } from "./quantity";
import type {
  ActionDraft,
  FarmState,
  OperationDraft,
  PlanDraft,
  Shortage,
} from "./types";
export { parseQuantity, roundKg } from "./quantity";

export function getShortages(
  input: StateInput,
  excludedJobId?: string,
  stockOverride?: { id: string; quantity: number },
): Shortage[] {
  const state = domainState(input);
  return state.inventoryBalances.flatMap((balance) => {
    const demand = plannedDemand(state, balance.id, excludedJobId);
    const available =
      stockOverride?.id === balance.id
        ? stockOverride.quantity
        : balance.quantity;
    // If some planned amounts are unknown, this is only the known minimum shortage.
    return available !== null && demand.knownQuantity > available
      ? [
          {
            stockId: balance.id,
            required: demand.knownQuantity,
            available,
            missing: roundKg(demand.knownQuantity - available),
            jobIds: demand.taskIds,
            ...(demand.unknownTaskIds.length ? { isMinimum: true } : {}),
          },
        ]
      : [];
  });
}
export function consumptionAction(
  input: StateInput,
  form: OperationDraft,
): ActionDraft {
  const state = domainState(input);
  const balance = state.inventoryBalances.find((b) => b.id === form.stockId);
  return {
    id: form.id,
    farmId: state.farm.id,
    actorId: state.farm.demoUserId,
    kind: "recordConsumption",
    completionId: "completion-" + form.jobId,
    taskId: form.jobId || null,
    fieldId: form.fieldId || null,
    inventoryBalanceId: form.stockId || null,
    productId: balance?.productId ?? null,
    actualQuantity: parseQuantity(form.quantity),
  };
}
export function planAction(
  input: StateInput,
  form: PlanDraft,
  id: string,
): ActionDraft {
  const state = domainState(input);
  const balance = state.inventoryBalances.find((b) => b.id === form.stockId);
  return {
    id: "plan-" + id,
    kind: "createTask",
    farmId: state.farm.id,
    actorId: state.farm.demoUserId,
    task: {
      id,
      farmId: state.farm.id,
      title: form.title.trim(),
      fieldId: form.fieldId,
      personId: form.personId,
      assetIds: [...form.machineIds],
      productId: balance?.productId ?? null,
      inventoryBalanceId: form.stockId || null,
      plannedQuantity: parseQuantity(form.quantity),
      type: "fertilizing",
      status: "planned",
      dependencyId: form.dependencyId || null,
      schedule: { date: null, startTime: null, endTime: null },
      scheduleLabel: "Today",
      completedAt: null,
    },
  };
}
export function sowingAction(input: StateInput, taskId: string): ActionDraft {
  const state = domainState(input);
  return {
    id: "sowing-" + taskId,
    kind: "completeTask",
    farmId: state.farm.id,
    actorId: state.farm.demoUserId,
    taskId,
    completionId: "completion-" + taskId,
  };
}
// Compatibility selectors for the existing form. All validation/calculation is shared.
export function previewOperation(input: StateInput, form: OperationDraft) {
  const state = domainState(input);
  const view = "domain" in input ? input : selectFarmView(state);
  const draft = consumptionAction(state, form);
  const actionPreview = previewAction(state, draft);
  const stock = view.stocks.find((s) => s.id === form.stockId);
  const quantity = parseQuantity(form.quantity);
  const after =
    stock && stock.quantity !== null && quantity !== null
      ? roundKg(stock.quantity - quantity)
      : null;
  return {
    ...actionPreview,
    actionDraft: draft,
    errors: actionPreview.issues.map((i) => i.message),
    job: view.jobs.find((t) => t.id === form.jobId),
    field: view.fields.find((f) => f.id === form.fieldId),
    stock,
    quantity,
    after,
    shortages:
      stock && after !== null && actionPreview.valid
        ? getShortages(state, form.jobId, { id: stock.id, quantity: after })
        : [],
  };
}
// Existing public functions delegate to the common pipeline; components use repository.confirm.
export function confirmOperation(
  state: FarmState,
  form: OperationDraft,
  expectedRevision: number,
  now?: string,
) {
  const action = consumptionAction(state, form);
  return commitAction(
    state,
    action,
    { approved: true, draftId: action.id, expectedRevision },
    now,
  );
}
export function createPlannedJob(
  state: FarmState,
  form: PlanDraft,
  id: string,
) {
  if (!form.title.trim()) throw new Error(domainMessage("errorJobName"));
  if (!state.people.some((p) => p.id === form.personId))
    throw new Error(domainMessage("errorChoosePerson"));
  if (
    !form.machineIds.length ||
    form.machineIds.some((a) => !state.assets.some((asset) => asset.id === a))
  )
    throw new Error(domainMessage("errorChooseMachine"));
  const action = planAction(state, form, id);
  return commitAction(state, action, {
    approved: true,
    draftId: action.id,
    expectedRevision: state.revision,
  });
}
export function completeSowingJob(state: FarmState, taskId: string) {
  const action = sowingAction(state, taskId);
  return commitAction(state, action, {
    approved: true,
    draftId: action.id,
    expectedRevision: state.revision,
  });
}
