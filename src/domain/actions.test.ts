import { describe, expect, it } from "vitest";
import { commitAction, isActionDraft, previewAction } from "./actions";
import { createDemoState } from "./demo";
import { createLegacyDemoState } from "./legacyDemo";
import { consumptionAction, planAction } from "./operations";
import { inventorySummary, plannedDemand, selectFarmView } from "./selectors";
import { FarmRepository } from "./repository";
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  isFarmState,
  loadFarm,
  saveFarm,
} from "./storage";
import type { ActionDraft, FarmState, Schedule } from "./types";

const form = {
  id: "north-draft",
  jobId: "north-fertilize",
  fieldId: "north",
  stockId: "fertilizer-a",
  quantity: "600",
};
const draftFor = (state: FarmState) => consumptionAction(state, form);
const approval = (state: FarmState, draft: ActionDraft) => ({
  approved: true,
  draftId: draft.id,
  expectedRevision: state.revision,
});
const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};
const schedule: Schedule = {
  date: "2026-10-04",
  startTime: "09:00",
  endTime: "11:00",
};
const base = (state: FarmState, id: string) => ({
  id,
  farmId: state.farm.id,
  actorId: state.farm.demoUserId,
});

describe("shared action pipeline", () => {
  it("validates and previews without changing any records", () => {
    const state = createDemoState();
    const before = structuredClone(state);
    const preview = previewAction(state, draftFor(state));
    expect(preview.valid).toBe(true);
    expect(preview.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: "confirmed",
          kind: "remainingStock",
          values: { before: 800, used: 600, after: 200 },
        }),
        expect.objectContaining({
          classification: "confirmed",
          kind: "plannedDemand",
          values: { required: 300 },
        }),
        expect.objectContaining({
          classification: "warning",
          kind: "shortage",
          values: { missing: 100 },
          records: expect.arrayContaining([
            { kind: "task", id: "east-fertilize" },
          ]),
        }),
      ]),
    );
    expect(state).toEqual(before);
  });
  it("requires explicit approval for the exact draft", () => {
    const state = createDemoState(),
      draft = draftFor(state),
      before = structuredClone(state);
    expect(() =>
      commitAction(state, draft, {
        ...approval(state, draft),
        approved: false,
      }),
    ).toThrow("explicitly confirm");
    expect(() =>
      commitAction(state, draft, {
        ...approval(state, draft),
        draftId: "another",
      }),
    ).toThrow("explicitly confirm");
    expect(state).toEqual(before);
  });
  it("commits one movement, actual operation and actor/time audit entry atomically", () => {
    const state = createDemoState(),
      draft = draftFor(state);
    const now = "2026-10-04T08:30:00.000Z";
    const next = commitAction(state, draft, approval(state, draft), now);
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(next.inventoryTransactions).toHaveLength(1);
    expect(next.operationRecords).toHaveLength(1);
    expect(next.activityLog).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({
      status: "completed",
      plannedQuantity: 600,
    });
    expect(next.operationRecords[0]).toMatchObject({
      taskId: "north-fertilize",
      fieldId: "north",
      personId: "ali",
      assetIds: ["tractor", "spreader"],
      productId: "product-fertilizer-a",
      actualQuantity: 600,
      occurredAt: now,
      recordedById: "murat",
    });
    expect(next.activityLog[0]).toMatchObject({
      actorId: "murat",
      action: "recordConsumption",
      draftId: draft.id,
      createdAt: now,
    });
    expect(next.inventoryTransactions[0].operationRecordId).toBe(
      next.operationRecords[0].id,
    );
    expect(next.activityLog[0].changedRecords).toContainEqual({
      kind: "operationRecord",
      id: next.operationRecords[0].id,
    });
    expect(isFarmState(next)).toBe(true);
    expect(state.inventoryBalances[0].quantity).toBe(800);
  });
  it("separates planned and actual quantities", () => {
    const state = createDemoState(),
      draft = consumptionAction(state, { ...form, quantity: "500" });
    const next = commitAction(state, draft, approval(state, draft));
    expect(next.tasks[0].plannedQuantity).toBe(600);
    expect(next.operationRecords[0].actualQuantity).toBe(500);
    expect(next.inventoryBalances[0].quantity).toBe(300);
    expect(next.tasks[2].plannedQuantity).toBeNull();
  });
  it("deduplicates both draft and completion IDs before checking a stale revision", () => {
    const state = createDemoState(),
      draft = draftFor(state);
    const once = commitAction(state, draft, approval(state, draft));
    expect(commitAction(once, draft, approval(state, draft))).toBe(once);
    if (draft.kind !== "recordConsumption") throw new Error("Wrong test draft");
    const retry = {
      ...draft,
      id: "new-draft",
      completionId: draft.completionId,
    };
    expect(commitAction(once, retry, approval(state, retry))).toBe(once);
    expect(once.inventoryTransactions).toHaveLength(1);
    expect(once.operationRecords).toHaveLength(1);
    expect(once.activityLog).toHaveLength(1);
    expect(once.inventoryBalances[0].quantity).toBe(200);
  });
  it("rejects reuse of a completion ID for a different task", () => {
    const state = createDemoState(),
      draft = draftFor(state);
    const once = commitAction(state, draft, approval(state, draft));
    if (draft.kind !== "recordConsumption") throw new Error("Wrong test draft");
    const bad = {
      ...draft,
      id: "east-draft",
      taskId: "east-fertilize",
      fieldId: "east",
      actualQuantity: 100,
    };
    expect(() => commitAction(once, bad, approval(once, bad))).toThrow(
      "another task",
    );
    expect(once.inventoryBalances[0].quantity).toBe(200);
  });
  it("creating a planned task uses the same pipeline but never creates physical consumption", () => {
    const state = createDemoState();
    const draft = planAction(
      state,
      {
        title: "South plan",
        fieldId: "south",
        personId: "ali",
        machineIds: ["tractor"],
        stockId: "fertilizer-a",
        quantity: "100",
        dependencyId: "",
      },
      "south-plan",
    );
    const preview = previewAction(state, draft);
    expect(preview.valid).toBe(true);
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "plannedDemand",
        classification: "confirmed",
        values: { required: 1000 },
      }),
    );
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "remainingStock",
        classification: "confirmed",
        values: { available: 800 },
      }),
    );
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "shortage",
        classification: "warning",
        values: { missing: 200 },
      }),
    );
    expect(state.tasks).toHaveLength(3);
    const next = commitAction(state, draft, approval(state, draft));
    expect(next.tasks).toHaveLength(4);
    expect(next.inventoryBalances[0].quantity).toBe(800);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(next.operationRecords).toHaveLength(0);
    expect(next.activityLog[0].action).toBe("createTask");
  });
  it("reports missing fields instead of inventing choices", () => {
    const state = createDemoState();
    const draft = consumptionAction(state, {
      ...form,
      jobId: "",
      fieldId: "",
      stockId: "",
      quantity: "",
    });
    const preview = previewAction(state, draft);
    expect(preview.valid).toBe(false);
    expect(
      preview.issues.filter((i) => i.kind === "missing").map((i) => i.field),
    ).toEqual(
      expect.arrayContaining([
        "taskId",
        "fieldId",
        "inventoryBalanceId",
        "actualQuantity",
      ]),
    );
    expect(() => commitAction(state, draft, approval(state, draft))).toThrow();
    expect(state.operationRecords).toHaveLength(0);
  });
  it("does not treat unknown balances or planned quantities as zero", () => {
    const state = createDemoState();
    state.inventoryBalances[0].quantity = null;
    const draft = draftFor(state),
      preview = previewAction(state, draft);
    expect(preview.valid).toBe(false);
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "remainingStock",
        classification: "unknown",
      }),
    );
    state.inventoryBalances[0].quantity = 800;
    state.tasks[1].plannedQuantity = null;
    expect(
      plannedDemand(state, "fertilizer-a", "north-fertilize").total,
    ).toBeNull();
    expect(inventorySummary(state, "fertilizer-a").missing).toBeNull();
    expect(previewAction(state, draft).impacts).toContainEqual(
      expect.objectContaining({
        kind: "plannedDemand",
        classification: "unknown",
      }),
    );
  });
  it("rejects malformed model proposals and non-finite or over-precision amounts", () => {
    const state = createDemoState();
    expect(isActionDraft({ kind: "executeSQL", id: "bad" })).toBe(false);
    expect(
      previewAction(state, {
        ...base(state, "bad"),
        kind: "createTask",
        task: {},
      } as ActionDraft).valid,
    ).toBe(false);
    const draft = draftFor(state);
    if (draft.kind !== "recordConsumption") throw new Error("Wrong test draft");
    for (const actualQuantity of [NaN, Infinity, -1, 0, 600.1234])
      expect(previewAction(state, { ...draft, actualQuantity }).valid).toBe(
        false,
      );
  });
  it("presentation fields cannot change stock, validation or effects", () => {
    const state = createDemoState(),
      draft = draftFor(state);
    const expected = previewAction(state, draft);
    state.assets[0].presentation = {
      iconKey: "another",
      scenePosition: { x: 100, y: 200 },
      visualState: "broken-looking",
    };
    state.fields[0].presentation = { scenePosition: { x: 5, y: 9 } };
    expect(previewAction(state, draft)).toEqual(expected);
    const view = selectFarmView(state);
    expect(view.jobs[0].id).toBe(state.tasks[0].id);
    expect(view.stocks[0].id).toBe(state.inventoryBalances[0].id);
  });
});

describe("record-based impact engine", () => {
  it("detects overlapping people and machines with exact times", () => {
    const state = createDemoState();
    state.tasks[0].schedule = schedule;
    state.tasks[1].schedule = {
      ...schedule,
      startTime: "10:00",
      endTime: "12:00",
    };
    const effects = previewAction(state, draftFor(state)).impacts;
    expect(effects).toContainEqual(
      expect.objectContaining({
        classification: "warning",
        kind: "resourceConflict",
        records: expect.arrayContaining([
          { kind: "person", id: "ali" },
          { kind: "asset", id: "tractor" },
          { kind: "task", id: "east-fertilize" },
        ]),
      }),
    );
  });
  it("does not invent conflicts for missing dates or hours", () => {
    const state = createDemoState();
    expect(previewAction(state, draftFor(state)).impacts).toContainEqual(
      expect.objectContaining({
        kind: "scheduleUnknown",
        classification: "unknown",
      }),
    );
    expect(
      previewAction(state, draftFor(state)).impacts.some(
        (i) => i.kind === "resourceConflict",
      ),
    ).toBe(false);
  });
  it("allows touching time boundaries and different known days", () => {
    const state = createDemoState();
    state.tasks[0].schedule = schedule;
    state.tasks[1].schedule = {
      ...schedule,
      startTime: "11:00",
      endTime: "12:00",
    };
    expect(
      previewAction(state, draftFor(state)).impacts.some(
        (i) => i.kind === "resourceConflict",
      ),
    ).toBe(false);
    state.tasks[1].schedule = { ...schedule, date: "2026-10-05" };
    expect(
      previewAction(state, draftFor(state)).impacts.some(
        (i) => i.kind === "resourceConflict",
      ),
    ).toBe(false);
  });
  it("identifies and blocks unfinished prerequisites when recording actual work", () => {
    const state = createDemoState();
    state.tasks[0].dependencyId = "east-fertilize";
    const preview = previewAction(state, draftFor(state));
    expect(preview.valid).toBe(false);
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependency",
        classification: "warning",
      }),
    );
  });
  it("previews unavailable assets and their planned tasks, then commits only on approval", () => {
    const state = createDemoState();
    const draft: ActionDraft = {
      ...base(state, "tractor-unavailable"),
      kind: "setAssetAvailability",
      assetId: "tractor",
      availability: "unavailable",
    };
    const preview = previewAction(state, draft);
    expect(
      preview.impacts.filter((i) => i.kind === "assetUnavailable"),
    ).toHaveLength(3);
    expect(state.assets[0].availability).toBe("available");
    const next = commitAction(state, draft, approval(state, draft));
    expect(next.assets[0].availability).toBe("unavailable");
    expect(next.inventoryBalances[0].quantity).toBe(800);
    expect(next.activityLog[0].action).toBe("setAssetAvailability");
    expect(previewAction(next, draftFor(next)).impacts).toContainEqual(
      expect.objectContaining({
        kind: "assetUnavailable",
        classification: "warning",
      }),
    );
  });
  it("rescheduling previews dependent tasks and resource overlaps", () => {
    const state = createDemoState();
    state.tasks[1].schedule = schedule;
    state.tasks[2].schedule = {
      ...schedule,
      startTime: "08:00",
      endTime: "09:00",
    };
    const draft: ActionDraft = {
      ...base(state, "reschedule-north"),
      kind: "rescheduleTask",
      taskId: "north-fertilize",
      schedule,
    };
    const preview = previewAction(state, draft);
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "resourceConflict",
        classification: "warning",
      }),
    );
    expect(preview.impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        classification: "warning",
        records: expect.arrayContaining([{ kind: "task", id: "north-sow" }]),
      }),
    );
    expect(state.tasks[0].schedule.date).toBeNull();
    const next = commitAction(state, draft, approval(state, draft));
    expect(next.tasks[0].schedule).toEqual(schedule);
    expect(next.inventoryBalances[0].quantity).toBe(800);
  });
  it("marks a linked task's missing calendar data unknown", () => {
    const state = createDemoState();
    const draft: ActionDraft = {
      ...base(state, "new-date"),
      kind: "rescheduleTask",
      taskId: "north-fertilize",
      schedule,
    };
    expect(previewAction(state, draft).impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        classification: "unknown",
      }),
    );
  });
});

describe("repository, storage and controlled migration", () => {
  it("preview/cancellation performs no storage writes", () => {
    const storage = memory(),
      repo = new FarmRepository(storage);
    repo.preview(draftFor(repo.getSnapshot().state));
    expect(storage.data.size).toBe(0);
    expect(repo.getSnapshot().state.inventoryBalances[0].quantity).toBe(800);
  });
  it("persists one atomic transaction and deduplicates concurrent taps and reloads", async () => {
    const storage = memory(),
      repo = new FarmRepository(storage),
      state = repo.getSnapshot().state,
      draft = draftFor(state);
    await Promise.all([
      repo.confirm(draft, approval(state, draft)),
      repo.confirm(draft, approval(state, draft)),
    ]);
    const reload = new FarmRepository(storage);
    await reload.confirm(draft, approval(state, draft));
    expect(reload.getSnapshot().state.inventoryBalances[0].quantity).toBe(200);
    expect(reload.getSnapshot().state.activityLog).toHaveLength(1);
    expect(reload.getSnapshot().state.inventoryTransactions).toHaveLength(1);
    expect(reload.getSnapshot().state.operationRecords).toHaveLength(1);
  });
  it("rejects stale previews after another repository changes records", async () => {
    const storage = memory(),
      repo = new FarmRepository(storage),
      other = new FarmRepository(storage);
    const state = repo.getSnapshot().state,
      draft = draftFor(state);
    const asset: ActionDraft = {
      ...base(state, "availability"),
      kind: "setAssetAvailability",
      assetId: "trailer",
      availability: "unavailable",
    };
    await other.confirm(asset, approval(state, asset));
    await expect(repo.confirm(draft, approval(state, draft))).rejects.toThrow(
      "Farm data changed",
    );
    expect(loadFarm(storage).state.inventoryBalances[0].quantity).toBe(800);
  });
  it("does not publish half a transaction when storage fails", async () => {
    const storage = memory();
    saveFarm(storage, createDemoState());
    const before = storage.data.get(STORAGE_KEY);
    const repo = new FarmRepository({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("Quota");
      },
    });
    const state = repo.getSnapshot().state,
      draft = draftFor(state);
    await expect(repo.confirm(draft, approval(state, draft))).rejects.toThrow(
      "Nothing was applied",
    );
    expect(repo.getSnapshot().state).toBe(state);
    expect(storage.data.get(STORAGE_KEY)).toBe(before);
  });
  it("reset restores initial stock, tasks and empty movement/operation/history collections", async () => {
    const storage = memory(),
      repo = new FarmRepository(storage);
    const state = repo.getSnapshot().state,
      draft = draftFor(state);
    await repo.confirm(draft, approval(state, draft));
    await repo.reset();
    const reset = loadFarm(storage).state;
    expect(reset).toEqual(createDemoState());
    expect(reset.inventoryBalances[0].quantity).toBe(800);
    expect(reset.inventoryTransactions).toHaveLength(0);
    expect(reset.operationRecords).toHaveLength(0);
    expect(reset.activityLog).toHaveLength(0);
  });
  it("migrates completed v1 work without losing custom tasks or double charging", async () => {
    const storage = memory(),
      old = createLegacyDemoState();
    old.revision = 2;
    old.stocks[0].quantity = 200;
    old.jobs[0] = {
      ...old.jobs[0],
      status: "completed",
      completedAt: "2026-10-04T08:00:00.000Z",
    };
    old.jobs.push({ ...old.jobs[1], id: "custom", title: "My custom plan" });
    old.consumptions.push({
      id: "legacy-tx",
      operationId: form.id,
      jobId: form.jobId,
      fieldId: form.fieldId,
      stockId: form.stockId,
      quantity: 600,
      before: 800,
      after: 200,
      createdAt: "2026-10-04T08:00:00.000Z",
    });
    const original = JSON.stringify(old);
    storage.setItem(LEGACY_STORAGE_KEY, original);
    const loaded = loadFarm(storage);
    expect(loaded.error).toBeNull();
    expect(loaded.migrated).toBe(true);
    expect(loaded.state.version).toBe(2);
    expect(loaded.state.inventoryBalances[0].quantity).toBe(200);
    expect(loaded.state.tasks.find((t) => t.id === "custom")?.title).toBe(
      "My custom plan",
    );
    expect(loaded.state.tasks[2].plannedQuantity).toBeNull();
    expect(loaded.state.operationRecords).toHaveLength(1);
    expect(
      commitAction(
        loaded.state,
        draftFor(loaded.state),
        approval(loaded.state, draftFor(loaded.state)),
      ),
    ).toBe(loaded.state);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(original);
    const repository = new FarmRepository(storage);
    await repository.ready;
    expect(loadFarm(storage).migrated).toBe(false);
  });
  it("migration preserves unknown legacy sowing time and quantity as null", () => {
    const storage = memory(),
      old = createLegacyDemoState();
    old.jobs[2].status = "completed";
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(old));
    const loaded = loadFarm(storage);
    expect(loaded.error).toBeNull();
    expect(loaded.state.operationRecords[0].actualQuantity).toBeNull();
    expect(loaded.state.operationRecords[0].occurredAt).toBeNull();
    expect(loaded.state.inventoryTransactions).toHaveLength(0);
  });
  it("keeps corrupt data untouched and blocks writes until explicit reset", async () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, "{broken");
    const repo = new FarmRepository(storage),
      state = repo.getSnapshot().state,
      draft = draftFor(state);
    expect(repo.getSnapshot().error).not.toBeNull();
    await expect(repo.confirm(draft, approval(state, draft))).rejects.toThrow();
    expect(storage.data.get(STORAGE_KEY)).toBe("{broken");
    await repo.reset();
    expect(loadFarm(storage).error).toBeNull();
  });
  it("rejects dangling IDs, cyclic dependencies, inconsistent balances and audit entries", () => {
    const state = createDemoState(),
      draft = draftFor(state);
    const next = commitAction(state, draft, approval(state, draft));
    expect(
      isFarmState({
        ...next,
        inventoryBalances: [{ ...next.inventoryBalances[0], quantity: 199 }],
      }),
    ).toBe(false);
    expect(
      isFarmState({
        ...next,
        operationRecords: [{ ...next.operationRecords[0], fieldId: "missing" }],
      }),
    ).toBe(false);
    expect(isFarmState({ ...next, activityLog: [] })).toBe(false);
    state.tasks[0].dependencyId = "north-sow";
    expect(isFarmState(state)).toBe(false);
  });
  it("migration writes use the repository lock and re-read newer v2 state", async () => {
    const storage = memory();
    storage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify(createLegacyDemoState()),
    );
    const state = createDemoState(),
      draft = draftFor(state);
    const newer = commitAction(state, draft, approval(state, draft));
    const repository = new FarmRepository(storage, async (write) => {
      // Simulate another tab committing after this instance read the legacy key.
      saveFarm(storage, newer);
      return write();
    });
    await repository.ready;
    expect(repository.getSnapshot().state.inventoryBalances[0].quantity).toBe(
      200,
    );
    expect(loadFarm(storage).state.operationRecords).toHaveLength(1);
  });
  it("a failed migration preserves the old copy and reports a storage error", async () => {
    const storage = memory(),
      original = JSON.stringify(createLegacyDemoState());
    storage.setItem(LEGACY_STORAGE_KEY, original);
    const repository = new FarmRepository({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("Quota");
      },
    });
    await repository.ready;
    expect(repository.getSnapshot().error).toContain("Nothing was applied");
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(original);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});

describe("uncertain schedule ordering", () => {
  it("does not confirm order for jobs on the same date without hours", () => {
    const state = createDemoState();
    state.tasks[2].schedule = {
      date: schedule.date,
      startTime: null,
      endTime: null,
    };
    const draft: ActionDraft = {
      ...base(state, "date-only"),
      kind: "rescheduleTask",
      taskId: "north-fertilize",
      schedule,
    };
    expect(previewAction(state, draft).impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        classification: "unknown",
      }),
    );
  });
  it("confirms linked order across different known dates", () => {
    const state = createDemoState();
    state.tasks[2].schedule = {
      date: "2026-10-05",
      startTime: null,
      endTime: null,
    };
    const draft: ActionDraft = {
      ...base(state, "date-order"),
      kind: "rescheduleTask",
      taskId: "north-fertilize",
      schedule,
    };
    expect(previewAction(state, draft).impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        classification: "confirmed",
      }),
    );
  });
});
