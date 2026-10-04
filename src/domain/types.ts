import type { UploadedDocument } from "../uploads/types";
export type Id = string;
export type Presentation = {
  iconKey?: string;
  scenePosition?: { x: number; y: number };
  visualState?: string;
};
type Entity = { id: Id; farmId: Id; presentation?: Presentation };
export type Farm = {
  id: Id;
  name: string;
  ownerId: Id;
  demoUserId: Id;
  presentation?: Presentation;
};
export type Field = Entity & {
  name: string;
  area: number;
  crop: string;
  stage: "Planned" | "Growing";
};
export type Person = Entity & {
  name: string;
  role: string;
  initials: string;
  availability?: "available" | "unavailable" | "unknown";
};
export type StorageLocation = Entity & {
  name: string;
  description: string;
  personId: Id;
};
export type Product = Entity & {
  name: string;
  kind: "fertilizer" | "pesticide" | "seed" | "fuel" | "unknown";
  unit: "kg" | "l" | null;
  manufacturer?: string | null;
  barcode?: string | null;
  codes?: string[];
  batch?: string | null;
  expiryDate?: string | null;
  packageSize?: { quantity: number; unit: "kg" | "g" | "l" | "ml" };
  documentSourceIds: Id[];
  unitPrice?: number | null;
  currency?: string;
};
export type InventoryBalance = Entity & {
  productId: Id;
  storageLocationId: Id;
  quantity: number | null;
};
export type Asset = Entity & {
  name: string;
  kind: "tractor" | "spreader" | "seeder" | "trailer";
  note: string;
  availability: "available" | "broken" | "unavailable" | "unknown";
  repairExpectedAt?: string | null;
};
// Local farm time, half-open intervals [start, end). Missing hours are unknown.
export type Schedule = {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
};
export type Task = Entity & {
  title: string;
  fieldId: Id;
  personId: Id;
  assetIds: Id[];
  inventoryBalanceId: Id | null;
  productId: Id | null;
  plannedQuantity: number | null;
  type: "fertilizing" | "sowing";
  status: "planned" | "completed";
  dependencyId: Id | null;
  schedule: Schedule;
  scheduleLabel: string;
  completedAt: string | null;
  serviceOfferId?: Id | null;
  lastFailureReason?: string | null;
};
export type ServiceOffer = Entity & {
  name: string;
  taskId: Id;
  price: number | null;
  transportCost: number | null;
  durationHours: number | null;
  currency: string;
};
export type OperationRecord = Entity & {
  outcome?: "completed" | "notCompleted";
  draftId: Id;
  completionId: Id;
  taskId: Id;
  fieldId: Id;
  personId: Id;
  assetIds: Id[];
  productId: Id | null;
  inventoryBalanceId: Id | null;
  actualQuantity: number | null;
  occurredAt: string | null;
  recordedById: Id;
};
export type InventoryTransaction = Entity & {
  draftId: Id;
  kind: "receipt" | "consumption" | "correction" | "return";
  inventoryBalanceId: Id;
  productId: Id;
  storageLocationId: Id;
  operationRecordId: Id | null;
  quantity: number;
  before: number;
  after: number;
  createdAt: string;
  recordedById: Id;
};
export type DocumentSource = Entity & {
  title: string;
  productId: Id | null;
  uri: string;
  verification: "verified" | "userProvided";
  uploaded?: UploadedDocument;
  verifiedAt: string;
  verifiedById: Id;
};
export type EntityReference = {
  kind:
    | "farm"
    | "field"
    | "storageLocation"
    | "product"
    | "inventoryBalance"
    | "inventoryTransaction"
    | "asset"
    | "person"
    | "task"
    | "operationRecord"
    | "documentSource"
    | "serviceOffer";
  id: Id;
};
export type ActivityLogEntry = Entity & {
  draftId: Id;
  actorId: Id;
  action: ActionDraft["kind"] | "legacyMigration" | "importProductDocument";
  changedRecords: EntityReference[];
  createdAt: string | null;
};
export type Impact = {
  sourceEntityType: EntityReference["kind"];
  sourceEntityId: Id;
  affectedEntityType: EntityReference["kind"];
  affectedEntityId: Id;
  relationType: string;
  severity: "info" | "attention" | "blocked";
  certainty: "confirmed" | "warning" | "unknown";
  reason: string;
  evidenceRefs: EntityReference[];
  suggestedQuestion: string | null;
  proposedChange: Record<string, unknown> | null;
  level: number;
  id: Id;
  classification: "confirmed" | "warning" | "unknown";
  kind:
    | "remainingStock"
    | "plannedDemand"
    | "shortage"
    | "resourceConflict"
    | "scheduleUnknown"
    | "dependency"
    | "assetUnavailable"
    | "dependentSchedule"
    | "directTask"
    | "repairUnknown"
    | "personUnavailable"
    | "materialCoverage"
    | "cost"
    | "costUnknown"
    | "serviceAlternative"
    | "taskFailure";
  messageKey: string;
  values: Record<string, string | number>;
  records: EntityReference[];
};
type DraftBase = { id: Id; farmId: Id; actorId: Id };
type ExistingActionDraft =
  | (DraftBase & {
      kind: "recordConsumption";
      completionId: Id;
      taskId: Id | null;
      fieldId: Id | null;
      productId: Id | null;
      inventoryBalanceId: Id | null;
      actualQuantity: number | null;
    })
  | (DraftBase & { kind: "completeTask"; completionId: Id; taskId: Id | null })
  | (DraftBase & { kind: "createTask"; task: Task })
  | (DraftBase & {
      kind: "setAssetAvailability";
      assetId: Id | null;
      availability: Asset["availability"];
    })
  | (DraftBase & {
      kind: "rescheduleTask";
      taskId: Id | null;
      schedule: Schedule;
    });
export type ActionDraft = ExistingActionDraft | ExtendedActionDraft;
type ExtendedActionDraft = DraftBase &
  (
    | {
        kind: "setPersonAvailability";
        personId: Id | null;
        availability: "available" | "unavailable" | "unknown";
      }
    | { kind: "assignTaskPerson"; taskId: Id | null; personId: Id | null }
    | { kind: "assignTaskAssets"; taskId: Id | null; assetIds: Id[] }
    | {
        kind: "changeTaskMaterial";
        taskId: Id | null;
        inventoryBalanceId: Id | null;
        productId: Id | null;
        plannedQuantity: number | null;
      }
    | {
        kind: "correctInventory";
        inventoryBalanceId: Id | null;
        countedQuantity: number | null;
      }
    | { kind: "failTask"; taskId: Id | null; reason: string | null }
    | { kind: "linkServiceOffer"; taskId: Id | null; serviceOfferId: Id | null }
  );
export type Confirmation = {
  approved: boolean;
  draftId: Id;
  expectedRevision: number;
};
export type ValidationIssue = {
  field: string;
  kind: "missing" | "invalid" | "blocked";
  message: string;
};
export type ActionPreview = {
  draftId: Id;
  revision: number;
  valid: boolean;
  issues: ValidationIssue[];
  impacts: Impact[];
};
export type FarmState = {
  version: 2;
  revision: number;
  farm: Farm;
  fields: Field[];
  people: Person[];
  storageLocations: StorageLocation[];
  products: Product[];
  inventoryBalances: InventoryBalance[];
  inventoryTransactions: InventoryTransaction[];
  assets: Asset[];
  tasks: Task[];
  operationRecords: OperationRecord[];
  documentSources: DocumentSource[];
  activityLog: ActivityLogEntry[];
  // Optional to preserve existing v2 saves without a destructive reset.
  serviceOffers?: ServiceOffer[];
};
// Editable form values are not domain records. Conversion happens before preview/commit.
export type OperationDraft = {
  id: Id;
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
  stockId: Id;
  required: number;
  available: number;
  missing: number;
  jobIds: Id[];
  isMinimum?: boolean;
};
