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
export type FarmState = {
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
export type OperationDraft = {
  id: string;
  jobId: string;
  fieldId: string;
  stockId: string;
  quantity: string;
};
export type PlanDraft = {
  title: string;
  fieldId: string;
  personId: string;
  machineIds: string[];
  stockId: string;
  quantity: string;
  dependencyId: string;
};
export type Shortage = {
  stockId: string;
  required: number;
  available: number;
  missing: number;
  jobIds: string[];
};
