export type Field = {
  id: string;
  name: string;
  area: number;
  crop: string;
  stage: "Planned" | "Growing";
  color: string;
};
export type Person = {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
};
export type Machine = {
  id: string;
  name: string;
  kind: "tractor" | "spreader" | "seeder" | "trailer";
  note: string;
};
export type Warehouse = {
  id: string;
  name: string;
  description: string;
  personId: string;
};
export type Stock = {
  id: string;
  name: string;
  warehouseId: string;
  quantity: number;
  unit: "kg";
};
export type Job = {
  id: string;
  title: string;
  fieldId: string;
  personId: string;
  machineIds: string[];
  stockId?: string;
  plannedQuantity: number;
  type: "fertilizing" | "sowing";
  status: "planned" | "completed";
  dependencyId?: string;
  scheduled: string;
  completedAt?: string;
};
export type Consumption = {
  id: string;
  operationId: string;
  jobId: string;
  fieldId: string;
  stockId: string;
  quantity: number;
  before: number;
  after: number;
  createdAt: string;
};
export type LegacyFarmState = {
  version: 1;
  revision: number;
  fields: Field[];
  people: Person[];
  machines: Machine[];
  warehouses: Warehouse[];
  stocks: Stock[];
  jobs: Job[];
  consumptions: Consumption[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isLegacyFarmState(value: unknown): value is LegacyFarmState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0
  )
    return false;
  for (const key of [
    "fields",
    "people",
    "machines",
    "warehouses",
    "stocks",
    "jobs",
    "consumptions",
  ]) {
    const items = value[key];
    if (
      !Array.isArray(items) ||
      !items.every((item) => isRecord(item) && typeof item.id === "string") ||
      new Set(items.map((item) => item.id)).size !== items.length
    )
      return false;
  }
  const state = value as unknown as LegacyFarmState;
  if (
    !state.fields.every(
      (f) =>
        typeof f.name === "string" &&
        finite(f.area) &&
        typeof f.crop === "string" &&
        ["Planned", "Growing"].includes(f.stage) &&
        typeof f.color === "string",
    )
  )
    return false;
  if (
    !state.people.every((p) =>
      [p.name, p.role, p.initials, p.color].every((v) => typeof v === "string"),
    )
  )
    return false;
  if (
    !state.machines.every(
      (m) =>
        typeof m.name === "string" &&
        typeof m.note === "string" &&
        ["tractor", "spreader", "seeder", "trailer"].includes(m.kind),
    )
  )
    return false;
  if (
    !state.warehouses.every(
      (w) =>
        typeof w.name === "string" &&
        typeof w.description === "string" &&
        state.people.some((p) => p.id === w.personId),
    )
  )
    return false;
  if (
    !state.stocks.every(
      (s) =>
        typeof s.name === "string" &&
        finite(s.quantity) &&
        s.unit === "kg" &&
        state.warehouses.some((w) => w.id === s.warehouseId),
    )
  )
    return false;
  if (
    !state.jobs.every(
      (j) =>
        typeof j.title === "string" &&
        typeof j.scheduled === "string" &&
        ["planned", "completed"].includes(j.status) &&
        ["fertilizing", "sowing"].includes(j.type) &&
        finite(j.plannedQuantity) &&
        state.fields.some((f) => f.id === j.fieldId) &&
        state.people.some((p) => p.id === j.personId) &&
        strings(j.machineIds) &&
        j.machineIds.every((id) => state.machines.some((m) => m.id === id)) &&
        (!j.stockId || state.stocks.some((s) => s.id === j.stockId)) &&
        (!j.dependencyId || state.jobs.some((d) => d.id === j.dependencyId)),
    )
  )
    return false;
  if (
    !state.consumptions.every(
      (c) =>
        typeof c.operationId === "string" &&
        typeof c.createdAt === "string" &&
        finite(c.quantity) &&
        c.quantity > 0 &&
        finite(c.before) &&
        finite(c.after) &&
        Math.abs(c.before - c.quantity - c.after) < 0.000001 &&
        state.jobs.some(
          (j) =>
            j.id === c.jobId &&
            j.status === "completed" &&
            j.fieldId === c.fieldId &&
            j.stockId === c.stockId,
        ),
    )
  )
    return false;
  return (
    new Set(state.consumptions.map((c) => c.operationId)).size ===
      state.consumptions.length &&
    new Set(state.consumptions.map((c) => c.jobId)).size ===
      state.consumptions.length
  );
}
