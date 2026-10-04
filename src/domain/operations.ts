import { domainMessage } from "../i18n/messages";
import type { FarmState, OperationDraft, PlanDraft, Shortage } from "./types";

// Arithmetic is always local application code. Interpreters only propose drafts.
export const roundKg = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;
export function parseQuantity(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number > 0 && number <= 1_000_000
    ? number
    : null;
}

export function getShortages(
  state: FarmState,
  excludedJobId?: string,
  stockOverride?: { id: string; quantity: number },
): Shortage[] {
  return state.stocks.flatMap((stock) => {
    const jobs = state.jobs.filter(
      (job) =>
        job.status === "planned" &&
        job.stockId === stock.id &&
        job.id !== excludedJobId,
    );
    const required = roundKg(
      jobs.reduce((total, job) => total + job.plannedQuantity, 0),
    );
    const available =
      stockOverride?.id === stock.id ? stockOverride.quantity : stock.quantity;
    return required > available
      ? [
          {
            stockId: stock.id,
            required,
            available,
            missing: roundKg(required - available),
            jobIds: jobs.map((job) => job.id),
          },
        ]
      : [];
  });
}

export function previewOperation(state: FarmState, draft: OperationDraft) {
  const errors: string[] = [];
  const job = state.jobs.find((item) => item.id === draft.jobId);
  const field = state.fields.find((item) => item.id === draft.fieldId);
  const stock = state.stocks.find((item) => item.id === draft.stockId);
  const quantity = parseQuantity(draft.quantity);
  if (!job) errors.push(domainMessage("errorChooseJob"));
  else {
    if (job.status !== "planned")
      errors.push(domainMessage("errorAlreadyComplete"));
    if (job.type !== "fertilizing")
      errors.push(domainMessage("errorOnlyFertilizing"));
    if (job.fieldId !== draft.fieldId)
      errors.push(domainMessage("errorJobField"));
    if (job.stockId !== draft.stockId)
      errors.push(domainMessage("errorJobMaterial"));
    if (
      job.dependencyId &&
      state.jobs.find((item) => item.id === job.dependencyId)?.status !==
        "completed"
    )
      errors.push(domainMessage("errorPrerequisite"));
  }
  if (!field) errors.push(domainMessage("errorChooseField"));
  if (!stock) errors.push(domainMessage("errorChooseMaterial"));
  if (quantity === null) errors.push(domainMessage("errorAmount"));
  if (stock && quantity !== null && quantity > stock.quantity)
    errors.push(domainMessage("errorAvailable", { quantity: stock.quantity }));
  const after =
    stock && quantity !== null ? roundKg(stock.quantity - quantity) : null;
  const shortages =
    stock && after !== null && errors.length === 0
      ? getShortages(state, draft.jobId, { id: stock.id, quantity: after })
      : [];
  return {
    errors,
    job,
    field,
    stock,
    quantity,
    after,
    shortages,
    valid: errors.length === 0,
  };
}

export function confirmOperation(
  state: FarmState,
  draft: OperationDraft,
  expectedRevision: number,
  now = new Date().toISOString(),
): FarmState {
  // The operation ID AND completed job guard protect retries, double taps and rephrased requests.
  if (
    state.consumptions.some(
      (record) =>
        record.operationId === draft.id || record.jobId === draft.jobId,
    )
  )
    return state;
  if (state.revision !== expectedRevision)
    throw new Error(domainMessage("errorStale"));
  const preview = previewOperation(state, draft);
  if (
    !preview.valid ||
    !preview.stock ||
    preview.quantity === null ||
    preview.after === null
  )
    throw new Error(preview.errors.join(" "));
  return {
    ...state,
    revision: state.revision + 1,
    stocks: state.stocks.map((stock) =>
      stock.id === draft.stockId
        ? { ...stock, quantity: preview.after! }
        : stock,
    ),
    jobs: state.jobs.map((job) =>
      job.id === draft.jobId
        ? { ...job, status: "completed", completedAt: now }
        : job,
    ),
    consumptions: [
      ...state.consumptions,
      {
        id: `consumption-${draft.id}`,
        operationId: draft.id,
        jobId: draft.jobId,
        fieldId: draft.fieldId,
        stockId: draft.stockId,
        quantity: preview.quantity,
        before: preview.stock.quantity,
        after: preview.after,
        createdAt: now,
      },
    ],
  };
}

export function createPlannedJob(
  state: FarmState,
  draft: PlanDraft,
  id: string,
): FarmState {
  const quantity = parseQuantity(draft.quantity);
  if (!draft.title.trim()) throw new Error(domainMessage("errorJobName"));
  if (!state.fields.some((field) => field.id === draft.fieldId))
    throw new Error(domainMessage("errorChooseField"));
  if (!state.people.some((person) => person.id === draft.personId))
    throw new Error(domainMessage("errorChoosePerson"));
  if (!state.stocks.some((stock) => stock.id === draft.stockId))
    throw new Error(domainMessage("errorChooseMaterial"));
  if (
    draft.machineIds.length === 0 ||
    draft.machineIds.some(
      (id) => !state.machines.some((machine) => machine.id === id),
    )
  )
    throw new Error(domainMessage("errorChooseMachine"));
  if (quantity === null) throw new Error(domainMessage("errorPlannedAmount"));
  if (
    draft.dependencyId &&
    !state.jobs.some((job) => job.id === draft.dependencyId)
  )
    throw new Error(domainMessage("errorExistingPrerequisite"));
  if (state.jobs.some((job) => job.id === id)) return state;
  return {
    ...state,
    revision: state.revision + 1,
    jobs: [
      ...state.jobs,
      {
        id,
        title: draft.title.trim(),
        fieldId: draft.fieldId,
        personId: draft.personId,
        machineIds: draft.machineIds,
        stockId: draft.stockId,
        plannedQuantity: quantity,
        dependencyId: draft.dependencyId || undefined,
        type: "fertilizing",
        status: "planned",
        scheduled: "Today",
      },
    ],
  };
}

export function completeSowingJob(state: FarmState, jobId: string): FarmState {
  const job = state.jobs.find((job) => job.id === jobId);
  if (!job || job.type !== "sowing")
    throw new Error(domainMessage("errorChooseSowing"));
  if (job.status === "completed") return state;
  if (
    job.dependencyId &&
    state.jobs.find((item) => item.id === job.dependencyId)?.status !==
      "completed"
  )
    throw new Error(domainMessage("errorPrerequisite"));
  return {
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((item) =>
      item.id === jobId
        ? {
            ...item,
            status: "completed",
            completedAt: new Date().toISOString(),
          }
        : item,
    ),
  };
}
