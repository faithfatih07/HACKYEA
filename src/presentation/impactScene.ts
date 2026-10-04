import { draftSource, projectDraft } from "../domain/impacts";
import type {
  ActionDraft,
  EntityReference,
  FarmState,
  Impact,
  Schedule,
} from "../domain/types";

export type SceneRelation =
  "storyAssigned" | "storyField" | "storyMaterial" | "storyEquipment";
export type SceneNode = { ref: EntityReference; relation: SceneRelation };
export type SceneBranch = { impact: Impact; context: EntityReference[] };

function taskContext(state: FarmState, id: string): EntityReference[] {
  const task = state.tasks.find((task) => task.id === id);
  return task
    ? [
        { kind: "field", id: task.fieldId },
        { kind: "person", id: task.personId },
        ...task.assetIds.map((id) => ({ kind: "asset" as const, id })),
      ]
    : [];
}

// Presentation only: links come from recorded assignments or the existing
// read-only domain projection. Every numeric result is the original Impact.
export function buildImpactScene(
  state: FarmState,
  draft: ActionDraft,
  impacts: Impact[],
  valid = true,
) {
  const source = draftSource(state, draft);
  const projected = projectDraft(state, draft);
  const task =
    source.kind === "task"
      ? projected.tasks.find((task) => task.id === source.id)
      : undefined;
  const nodes: SceneNode[] = task
    ? [
        {
          ref: { kind: "person", id: task.personId },
          relation: "storyAssigned",
        },
        {
          ref: {
            kind: "field",
            id:
              draft.kind === "recordConsumption"
                ? (draft.fieldId ?? task.fieldId)
                : task.fieldId,
          },
          relation: "storyField",
        },
        ...(task.productId
          ? [
              {
                ref: {
                  kind: "product" as const,
                  id:
                    draft.kind === "recordConsumption"
                      ? (draft.productId ?? task.productId)
                      : task.productId,
                },
                relation: "storyMaterial" as const,
              },
            ]
          : []),
        ...task.assetIds.map((id) => ({
          ref: { kind: "asset" as const, id },
          relation: "storyEquipment" as const,
        })),
      ]
    : [];
  const stockRelevant = [
    "recordConsumption",
    "correctInventory",
    "createTask",
    "changeTaskMaterial",
  ].includes(draft.kind);
  const stock = stockRelevant
    ? impacts.find((impact) => impact.kind === "remainingStock")
    : undefined;
  const branches: SceneBranch[] = impacts
    .filter(
      (impact) =>
        [
          "materialCoverage",
          "assetUnavailable",
          "personUnavailable",
          "resourceConflict",
          "scheduleUnknown",
          "dependentSchedule",
          "dependency",
          "serviceAlternative",
          "taskFailure",
        ].includes(impact.kind) &&
        (impact.kind !== "materialCoverage" || stockRelevant),
    )
    .map((impact) => ({
      impact,
      context: taskContext(
        projected,
        impact.affectedEntityType === "task"
          ? impact.affectedEntityId
          : String(impact.values.taskId ?? ""),
      ).filter((ref) => !(ref.kind === source.kind && ref.id === source.id)),
    }));
  // Put actionable stock/resource effects before secondary unknown-time notices.
  branches.sort(
    (a, b) =>
      (a.impact.kind === "scheduleUnknown"
        ? 2
        : a.impact.kind === "dependentSchedule"
          ? 1
          : 0) -
      (b.impact.kind === "scheduleUnknown"
        ? 2
        : b.impact.kind === "dependentSchedule"
          ? 1
          : 0),
  );
  const repair =
    draft.kind === "setAssetAvailability"
      ? state.assets.find((a) => a.id === draft.assetId)
      : undefined;
  const schedule =
    draft.kind === "rescheduleTask"
      ? {
          before: state.tasks.find((t) => t.id === draft.taskId)?.schedule ?? {
            date: null,
            startTime: null,
            endTime: null,
          },
          after: draft.schedule,
          status: impacts.some((i) => i.kind === "resourceConflict")
            ? ("conflict" as const)
            : !valid ||
                !completeSchedule(draft.schedule) ||
                impacts.some((i) => i.kind === "scheduleUnknown")
              ? ("unknown" as const)
              : ("clear" as const),
        }
      : null;
  return { source, nodes, stock, branches, repair, schedule };
}

function completeSchedule(schedule: Schedule) {
  return Boolean(schedule.date && schedule.startTime && schedule.endTime);
}

export type SavedStory = {
  before: FarmState;
  after: FarmState;
  draft: ActionDraft;
  impacts: Impact[];
};
// A saved visual is permitted only for an actual new, logged commit. Replaying
// this snapshot never calls previewAction/commitAction or an AI provider.
export function savedStory(
  before: FarmState,
  after: FarmState,
  draft: ActionDraft,
  impacts: Impact[],
): SavedStory | null {
  if (
    after.revision <= before.revision ||
    before.activityLog.some((log) => log.draftId === draft.id) ||
    !after.activityLog.some((log) => log.draftId === draft.id)
  )
    return null;
  return { before, after, draft, impacts };
}
