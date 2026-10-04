import { describe, expect, it } from "vitest";
import { createDemoState } from "../domain/demo";
import { createChangeDraft } from "../domain/drafts";
import { consumptionAction } from "../domain/operations";
import { commitAction, previewAction } from "../domain/actions";
import { buildImpactScene, savedStory } from "./impactScene";
import type { ActionDraft, FarmState, Schedule } from "../domain/types";

function consumption(state: FarmState, quantity = "600") {
  return consumptionAction(state, {
    id: "scene-draft",
    jobId: "north-fertilize",
    fieldId: "north",
    stockId: "fertilizer-a",
    quantity,
  });
}
function scene(state: FarmState, draft: ActionDraft) {
  const preview = previewAction(state, draft);
  return buildImpactScene(state, draft, preview.impacts, preview.valid);
}
function approval(state: FarmState, draft: ActionDraft) {
  return {
    approved: true,
    draftId: draft.id,
    expectedRevision: state.revision,
  };
}
function reschedule(state: FarmState, schedule: Schedule): ActionDraft {
  return {
    ...createChangeDraft(state, "rescheduleTask", "north-fertilize"),
    kind: "rescheduleTask",
    taskId: "north-fertilize",
    schedule,
  };
}

describe("impact presentation uses domain results without writes", () => {
  it("links recorded person, field, product and equipment, reusing original impacts", () => {
    const state = createDemoState(),
      draft = consumption(state),
      before = structuredClone(state);
    const preview = previewAction(state, draft),
      view = buildImpactScene(state, draft, preview.impacts);
    expect(view.nodes.map((n) => n.ref.id)).toEqual([
      "ali",
      "north",
      "product-fertilizer-a",
      "tractor",
      "spreader",
    ]);
    expect(view.stock).toBe(
      preview.impacts.find((i) => i.kind === "remainingStock"),
    );
    expect(view.stock?.values).toEqual({ before: 800, used: 600, after: 200 });
    expect(
      view.branches.find(
        (b) =>
          b.impact.kind === "materialCoverage" &&
          b.impact.affectedEntityId === "east-fertilize",
      )?.impact.values,
    ).toMatchObject({ missing: 100 });
    expect(state).toEqual(before);
  });
  it("updates every numeric preview from the engine when an amount is edited", () => {
    const state = createDemoState();
    const view = scene(state, consumption(state, "450"));
    expect(view.stock?.values.after).toBe(350);
    expect(
      view.branches.find(
        (b) =>
          b.impact.kind === "materialCoverage" &&
          b.impact.affectedEntityId === "east-fertilize",
      )?.impact.values,
    ).toMatchObject({ missing: 0 });
    expect(state.inventoryBalances[0].quantity).toBe(800);
  });
  it("retains unknown stock rather than displaying zero", () => {
    const state = createDemoState();
    state.inventoryBalances[0].quantity = null;
    expect(
      scene(state, consumption(state)).stock?.values.after,
    ).toBeUndefined();
    expect(state.inventoryBalances[0].quantity).toBeNull();
  });
  it("breakdown branches show field, assigned worker and other equipment without disabling the worker", () => {
    const state = createDemoState(),
      before = structuredClone(state);
    const view = scene(
      state,
      createChangeDraft(state, "setAssetAvailability", "tractor"),
    );
    const north = view.branches.find(
      (b) =>
        b.impact.kind === "assetUnavailable" &&
        b.impact.affectedEntityId === "north-fertilize",
    );
    expect(north?.context).toEqual(
      expect.arrayContaining([
        { kind: "field", id: "north" },
        { kind: "person", id: "ali" },
        { kind: "asset", id: "spreader" },
      ]),
    );
    expect(view.repair?.repairExpectedAt).toBeNull();
    expect(state.people.find((p) => p.id === "ali")?.availability).toBe(
      "available",
    );
    expect(state).toEqual(before);
  });
  it("supports other resource ids and assignments, not just the demo tractor", () => {
    const state = createDemoState();
    state.assets.push({
      ...state.assets[0],
      id: "another-machine",
      name: "Other machine",
    });
    state.tasks[0].assetIds = ["another-machine", "trailer"];
    state.tasks[0].personId = "ece";
    const view = scene(
      state,
      createChangeDraft(state, "setAssetAvailability", "another-machine"),
    );
    const north = view.branches.find(
      (b) =>
        b.impact.kind === "assetUnavailable" &&
        b.impact.affectedEntityId === "north-fertilize",
    );
    expect(view.source.id).toBe("another-machine");
    expect(north?.context.map((r) => r.id)).toEqual([
      "north",
      "ece",
      "trailer",
    ]);
  });
  it("shows real conflicts, preserving original dates and assignments until approval", () => {
    const state = createDemoState(),
      before = structuredClone(state);
    const view = scene(
      state,
      reschedule(state, {
        date: state.tasks[1].schedule.date,
        startTime: "10:00",
        endTime: "12:00",
      }),
    );
    expect(view.schedule?.status).toBe("conflict");
    expect(view.schedule?.before.date).toBeNull();
    expect(
      view.branches.some((b) => b.impact.kind === "resourceConflict"),
    ).toBe(true);
    expect(state).toEqual(before);
  });
  it("shows no overlap only when recorded windows permit that conclusion", () => {
    const state = createDemoState();
    // The sowing task has no recorded window: that must remain unknown.
    expect(
      scene(
        state,
        reschedule(state, {
          date: state.tasks[1].schedule.date,
          startTime: "12:00",
          endTime: "14:00",
        }),
      ).schedule?.status,
    ).toBe("unknown");
    state.tasks[2].schedule = {
      date: state.tasks[1].schedule.date,
      startTime: "15:00",
      endTime: "17:00",
    };
    expect(
      scene(
        state,
        reschedule(state, {
          date: state.tasks[1].schedule.date,
          startTime: "12:00",
          endTime: "14:00",
        }),
      ).schedule?.status,
    ).toBe("clear");
    expect(
      scene(
        state,
        reschedule(state, {
          date: state.tasks[1].schedule.date,
          startTime: null,
          endTime: null,
        }),
      ).schedule?.status,
    ).toBe("unknown");
    expect(
      scene(
        state,
        reschedule(state, {
          date: state.tasks[1].schedule.date,
          startTime: "14:00",
          endTime: "12:00",
        }),
      ).schedule?.status,
    ).toBe("unknown");
  });
  it("planning a task and replaying its view never deduct physical stock", () => {
    const state = createDemoState(),
      before = structuredClone(state);
    const draft: ActionDraft = {
      id: "new-plan",
      farmId: state.farm.id,
      actorId: "murat",
      kind: "createTask",
      task: { ...state.tasks[0], id: "new-task" },
    };
    for (let i = 0; i < 4; i++) scene(state, draft);
    expect(state).toEqual(before);
    expect(state.inventoryBalances[0].quantity).toBe(800);
  });
  it("saved visuals require a real new logged commit, and replay never commits again", () => {
    const state = createDemoState(),
      draft = consumption(state),
      impacts = previewAction(state, draft).impacts;
    expect(savedStory(state, state, draft, impacts)).toBeNull();
    const after = commitAction(state, draft, approval(state, draft));
    const receipt = savedStory(state, after, draft, impacts)!;
    expect(receipt.after.inventoryBalances[0].quantity).toBe(200);
    for (let i = 0; i < 4; i++)
      buildImpactScene(receipt.before, receipt.draft, receipt.impacts);
    expect(receipt.after.inventoryTransactions).toHaveLength(1);
    expect(receipt.after.operationRecords).toHaveLength(1);
    expect(receipt.after.activityLog).toHaveLength(1);
    const again = commitAction(after, draft, approval(after, draft));
    expect(again.inventoryBalances[0].quantity).toBe(200);
    expect(savedStory(after, again, draft, impacts)).toBeNull();
    expect(
      savedStory(state, after, { ...draft, id: "uncommitted-draft" }, impacts),
    ).toBeNull();
  });
});
