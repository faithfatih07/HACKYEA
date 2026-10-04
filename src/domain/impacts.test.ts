import { describe, expect, it } from "vitest";
import { commitAction, isActionDraft, previewAction } from "./actions";
import { calculateImpacts } from "./impacts";
import { createDemoState } from "./demo";
import { createChangeDraft } from "./drafts";
import { consumptionAction } from "./operations";
import { isFarmState, loadFarm, saveFarm, STORAGE_KEY } from "./storage";
import { parseCountQuantity } from "./quantity";
import { FarmRepository } from "./repository";
import type { ActionDraft, FarmState } from "./types";

const consumption = (s: FarmState) =>
  consumptionAction(s, {
    id: "demo-use",
    jobId: "north-fertilize",
    fieldId: "north",
    stockId: "fertilizer-a",
    quantity: "600",
  });
const confirm = (s: FarmState, d: ActionDraft) =>
  commitAction(s, d, {
    approved: true,
    draftId: d.id,
    expectedRevision: s.revision,
  });
const reschedule = (s: FarmState): ActionDraft => ({
  ...createChangeDraft(s, "rescheduleTask", "north-fertilize"),
  kind: "rescheduleTask",
  taskId: "north-fertilize",
  schedule: {
    date: s.tasks[1].schedule.date,
    startTime: "09:30",
    endTime: "10:30",
  },
});

describe("general decision engine", () => {
  it("parses zero counts without accepting unknown/invalid amounts as zero", () => {
    expect(parseCountQuantity("0")).toBe(0);
    expect(parseCountQuantity("12,5")).toBe(12.5);
    for (const input of ["", "-1", "unknown", "NaN", "1000001"])
      expect(parseCountQuantity(input)).toBeNull();
  });
  it("computes only recorded cost differences with matching currencies", () => {
    const s = createDemoState();
    s.products[0].unitPrice = 2;
    s.products[0].currency = "TRY";
    const d = createChangeDraft(s, "changeTaskMaterial", "north-fertilize");
    if (d.kind !== "changeTaskMaterial") throw new Error();
    d.plannedQuantity = 500;
    expect(previewAction(s, d).impacts).toContainEqual(
      expect.objectContaining({
        kind: "cost",
        values: {
          before: 1200,
          after: 1000,
          difference: -200,
          currency: "TRY",
        },
      }),
    );
    s.products[0].unitPrice = null;
    expect(previewAction(s, d).impacts.some((i) => i.kind === "cost")).toBe(
      false,
    );
    expect(
      previewAction(s, d).impacts.some(
        (i) => i.messageKey === "impactCostChangeUnknown",
      ),
    ).toBe(true);
  });
  it("uses product units and never confirms invalid numeric model proposals", () => {
    const s = createDemoState();
    s.products[0].unit = "l";
    s.products[0].kind = "fuel";
    s.products[0].unitPrice = 2;
    s.products[0].currency = "TRY";
    const d = consumption(s);
    expect(
      previewAction(s, d).impacts.find((i) => i.kind === "remainingStock")
        ?.reason,
    ).toContain("800 l");
    if (d.kind !== "recordConsumption") throw new Error();
    d.actualQuantity = Number.POSITIVE_INFINITY;
    const p = previewAction(s, d);
    expect(p.valid).toBe(false);
    expect(
      p.impacts.some(
        (i) =>
          i.kind === "cost" ||
          (i.kind === "remainingStock" && i.certainty === "confirmed"),
      ),
    ).toBe(false);
  });
  it("records completion without inventing actual consumption", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "completeTask", "north-fertilize");
    const next = confirm(s, d);
    expect(next.tasks[0].status).toBe("completed");
    expect(next.operationRecords[0].actualQuantity).toBeNull();
    expect(next.inventoryBalances[0].quantity).toBe(800);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(next.activityLog).toHaveLength(1);
  });
  it("computes stock, a real downstream shortage and navigable evidence without mutation", () => {
    const s = createDemoState(),
      before = structuredClone(s),
      d = consumption(s);
    const p = previewAction(s, d);
    expect(s).toEqual(before);
    expect(p.impacts.find((i) => i.kind === "remainingStock")?.values).toEqual({
      before: 800,
      used: 600,
      after: 200,
    });
    const coverage = p.impacts.find(
      (i) =>
        i.kind === "materialCoverage" &&
        i.affectedEntityId === "east-fertilize",
    )!;
    expect(coverage).toMatchObject({
      sourceEntityType: "inventoryBalance",
      sourceEntityId: "fertilizer-a",
      affectedEntityType: "task",
      level: 2,
      certainty: "warning",
    });
    expect(coverage.values).toMatchObject({
      required: 300,
      available: 200,
      missing: 100,
    });
    expect(coverage.evidenceRefs).toContainEqual({
      kind: "product",
      id: "product-fertilizer-a",
    });
    for (const impact of p.impacts) {
      expect(impact.reason).not.toContain("{task}");
      expect(impact.evidenceRefs.length).toBeGreaterThan(0);
      expect(impact.classification).toBe(impact.certainty);
    }
  });
  it("retains one consumption, operation and history entry under both idempotency keys", () => {
    const s = createDemoState(),
      d = consumption(s),
      next = confirm(s, d);
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(confirm(next, d)).toBe(next);
    expect(confirm(next, { ...d, id: "retry" })).toBe(next);
    expect(next.inventoryTransactions).toHaveLength(1);
    expect(next.operationRecords).toHaveLength(1);
    expect(next.activityLog).toHaveLength(1);
  });
  it("finds breakdown effects from arbitrary machine IDs and dependency edges", () => {
    const s = createDemoState();
    s.assets[0].id = "TR-OTHER";
    s.tasks.forEach((t) => {
      t.assetIds = t.assetIds.map((id) => (id === "tractor" ? "TR-OTHER" : id));
    });
    s.tasks[2].assetIds = ["seeder"];
    s.tasks.push({
      ...s.tasks[2],
      id: "next-stage",
      title: "Later work",
      dependencyId: "north-sow",
    });
    const d = createChangeDraft(s, "setAssetAvailability", "TR-OTHER");
    const effects = calculateImpacts(s, d);
    expect(
      effects
        .filter((i) => i.kind === "assetUnavailable")
        .map((i) => i.affectedEntityId),
    ).toEqual(["north-fertilize", "east-fertilize"]);
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        sourceEntityId: "north-fertilize",
        affectedEntityId: "north-sow",
        level: 2,
      }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        sourceEntityId: "north-sow",
        affectedEntityId: "next-stage",
        level: 3,
      }),
    );
    expect(effects.some((i) => i.affectedEntityId === "south")).toBe(false);
  });
  it("keeps repair time unknown and changes only the asset after approval", () => {
    const s = createDemoState(),
      before = structuredClone(s),
      d = createChangeDraft(s, "setAssetAvailability", "tractor");
    const p = previewAction(s, d);
    expect(p.impacts).toContainEqual(
      expect.objectContaining({
        kind: "repairUnknown",
        certainty: "unknown",
        suggestedQuestion: expect.any(String),
      }),
    );
    expect(s).toEqual(before);
    expect(() =>
      commitAction(s, d, {
        approved: false,
        draftId: d.id,
        expectedRevision: 0,
      }),
    ).toThrow();
    const next = confirm(s, d);
    expect(next.assets[0].availability).toBe("broken");
    expect(next.tasks).toEqual(s.tasks);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(next.activityLog).toHaveLength(1);
    expect(confirm(next, d)).toBe(next);
  });
  it("asks for both hours before rescheduling and never confirms a conflict with missing hours", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "rescheduleTask", "north-fertilize"),
      before = structuredClone(s);
    const p = previewAction(s, d);
    expect(p.valid).toBe(false);
    expect(p.issues).toContainEqual(
      expect.objectContaining({ field: "schedule", kind: "missing" }),
    );
    expect(p.impacts.some((i) => i.kind === "resourceConflict")).toBe(false);
    expect(p.impacts.some((i) => i.kind === "scheduleUnknown")).toBe(true);
    expect(() => confirm(s, d)).toThrow("start time");
    expect(s).toEqual(before);
  });
  it("finds actual Ali / tractor / spreader overlaps, leaving material and downstream dates unchanged", () => {
    const s = createDemoState(),
      d = reschedule(s);
    const conflicts = previewAction(s, d).impacts.filter(
      (i) => i.kind === "resourceConflict",
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].evidenceRefs).toEqual(
      expect.arrayContaining([
        { kind: "person", id: "ali" },
        { kind: "asset", id: "tractor" },
        { kind: "asset", id: "spreader" },
        { kind: "task", id: "east-fertilize" },
      ]),
    );
    expect(previewAction(s, d).impacts).toContainEqual(
      expect.objectContaining({
        kind: "dependentSchedule",
        affectedEntityId: "north-sow",
        certainty: "unknown",
        level: 2,
      }),
    );
    const next = confirm(s, d);
    expect(next.tasks[0].schedule).toEqual(
      d.kind === "rescheduleTask" ? d.schedule : null,
    );
    expect(next.tasks[0].plannedQuantity).toBe(600);
    expect(next.tasks[2]).toEqual(s.tasks[2]);
    expect(next.inventoryBalances).toEqual(s.inventoryBalances);
  });
  it("uses reassigned person and machines, never old assignments, for overlap evidence", () => {
    const s = createDemoState();
    s.tasks[0].schedule = { ...s.tasks[1].schedule };
    const person = createChangeDraft(s, "assignTaskPerson", "north-fertilize");
    if (person.kind !== "assignTaskPerson") throw new Error();
    person.personId = "ece";
    const p = previewAction(s, person);
    expect(p.valid).toBe(true);
    const conflict = p.impacts.find((i) => i.kind === "resourceConflict")!;
    expect(conflict.evidenceRefs).not.toContainEqual({
      kind: "person",
      id: "ali",
    });
    expect(confirm(s, person).tasks[0].personId).toBe("ece");
    const machine = createChangeDraft(s, "assignTaskAssets", "north-fertilize");
    if (machine.kind !== "assignTaskAssets") throw new Error();
    machine.assetIds = ["trailer"];
    const machineConflict = previewAction(s, machine).impacts.find(
      (i) => i.kind === "resourceConflict",
    )!;
    expect(machineConflict.evidenceRefs).toContainEqual({
      kind: "person",
      id: "ali",
    });
    expect(machineConflict.evidenceRefs).not.toContainEqual({
      kind: "asset",
      id: "tractor",
    });
    expect(confirm(s, machine).tasks[0].assetIds).toEqual(["trailer"]);
  });
  it("finds unavailable person's real tasks and downstream effects", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "setPersonAvailability", "ali");
    const p = previewAction(s, d);
    expect(
      p.impacts
        .filter((i) => i.kind === "personUnavailable")
        .map((i) => i.affectedEntityId),
    ).toEqual(s.tasks.map((t) => t.id));
    expect(
      p.impacts.some((i) => i.kind === "dependentSchedule" && i.level === 2),
    ).toBe(true);
    const next = confirm(s, d);
    expect(next.people.find((p) => p.id === "ali")?.availability).toBe(
      "unavailable",
    );
    expect(next.tasks).toEqual(s.tasks);
  });
  it("changing planned amount affects demand but never physical inventory", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "changeTaskMaterial", "north-fertilize");
    if (d.kind !== "changeTaskMaterial") throw new Error();
    d.plannedQuantity = 500;
    expect(previewAction(s, d).impacts).toContainEqual(
      expect.objectContaining({
        kind: "plannedDemand",
        values: { required: 800 },
      }),
    );
    const next = confirm(s, d);
    expect(next.inventoryBalances[0].quantity).toBe(800);
    expect(next.tasks[0].plannedQuantity).toBe(500);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(next.operationRecords).toHaveLength(0);
  });
  it("supports another product/location and recalculates both old and new demand", () => {
    const s = createDemoState();
    s.products.push({
      ...s.products[0],
      id: "seed",
      name: "Demo Seed",
      kind: "seed",
      unitPrice: 2,
      currency: "TRY",
    });
    s.inventoryBalances.push({
      ...s.inventoryBalances[0],
      id: "seed-maintenance",
      productId: "seed",
      storageLocationId: "maintenance",
      quantity: 50,
    });
    const d = createChangeDraft(s, "changeTaskMaterial", "north-fertilize");
    if (d.kind !== "changeTaskMaterial") throw new Error();
    Object.assign(d, {
      productId: "seed",
      inventoryBalanceId: "seed-maintenance",
      plannedQuantity: 100,
    });
    const p = previewAction(s, d);
    expect(p.valid).toBe(true);
    expect(p.impacts).toContainEqual(
      expect.objectContaining({
        kind: "cost",
        values: { amount: 200, currency: "TRY" },
      }),
    );
    expect(
      p.impacts
        .filter((i) => i.kind === "plannedDemand")
        .map((i) => i.values.required),
    ).toEqual([100, 300]);
    const next = confirm(s, d);
    expect(next.inventoryBalances).toEqual(s.inventoryBalances);
    expect(next.tasks[0].productId).toBe("seed");
  });
  it("keeps missing prices unknown and adds only recorded service/transport costs", () => {
    const s = createDemoState();
    expect(
      previewAction(s, consumption(s)).impacts.some(
        (i) => i.kind === "costUnknown" && i.certainty === "unknown",
      ),
    ).toBe(true);
    const d = createChangeDraft(s, "linkServiceOffer", "north-fertilize");
    if (d.kind !== "linkServiceOffer") throw new Error();
    d.serviceOfferId = "service-a";
    expect(previewAction(s, d).impacts).toContainEqual(
      expect.objectContaining({
        kind: "cost",
        values: {
          offer: "Demo Hizmet A",
          offerId: "service-a",
          amount: 2000,
          currency: "TRY",
        },
      }),
    );
    d.serviceOfferId = "service-b";
    const p = previewAction(s, d);
    expect(p.impacts.some((i) => i.kind === "cost")).toBe(false);
    expect(
      p.impacts.some(
        (i) => i.kind === "costUnknown" && i.certainty === "unknown",
      ),
    ).toBe(true);
    const next = confirm(s, d);
    expect(next.tasks[0].serviceOfferId).toBe("service-b");
    expect(next.tasks[0].assetIds).toEqual(s.tasks[0].assetIds);
    expect(next.inventoryBalances).toEqual(s.inventoryBalances);
  });
  it("requires a valid recorded offer belonging to this task", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "linkServiceOffer", "east-fertilize");
    if (d.kind !== "linkServiceOffer") throw new Error();
    d.serviceOfferId = "service-a";
    expect(previewAction(s, d).valid).toBe(false);
    expect(() => confirm(s, d)).toThrow();
  });
  it("corrects stock only on approval, logs the count once and allows an actual zero count", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "correctInventory", "fertilizer-a");
    if (d.kind !== "correctInventory") throw new Error();
    d.countedQuantity = 0;
    expect(previewAction(s, d).valid).toBe(true);
    expect(s.inventoryBalances[0].quantity).toBe(800);
    const next = confirm(s, d);
    expect(next.inventoryBalances[0].quantity).toBe(0);
    expect(next.inventoryTransactions[0]).toMatchObject({
      kind: "correction",
      before: 800,
      after: 0,
      quantity: 800,
    });
    expect(next.tasks).toEqual(s.tasks);
    expect(next.operationRecords).toHaveLength(0);
    expect(next.activityLog).toHaveLength(1);
    expect(confirm(next, d)).toBe(next);
    expect(isFarmState(next)).toBe(true);
  });
  it("records failed attempts without consumption or cancellation and allows later completion", () => {
    const s = createDemoState(),
      d = createChangeDraft(s, "failTask", "north-fertilize");
    if (d.kind !== "failTask") throw new Error();
    expect(previewAction(s, d).valid).toBe(false);
    d.reason = "Machine stopped";
    const failed = confirm(s, d);
    expect(failed.tasks[0].status).toBe("planned");
    expect(failed.tasks[0].lastFailureReason).toBe("Machine stopped");
    expect(failed.operationRecords[0].outcome).toBe("notCompleted");
    expect(failed.inventoryTransactions).toHaveLength(0);
    const next = confirm(failed, consumption(failed));
    expect(next.tasks[0].status).toBe("completed");
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(next.operationRecords).toHaveLength(2);
    expect(isFarmState(next)).toBe(true);
  });
  it.each([
    "setAssetAvailability",
    "setPersonAvailability",
    "rescheduleTask",
    "assignTaskPerson",
    "assignTaskAssets",
    "changeTaskMaterial",
    "correctInventory",
    "failTask",
    "linkServiceOffer",
  ] as const)("accepts %s through the same shape boundary", (kind) => {
    const s = createDemoState();
    const d = createChangeDraft(
      s,
      kind,
      kind === "setAssetAvailability"
        ? "tractor"
        : kind === "setPersonAvailability"
          ? "ali"
          : kind === "correctInventory"
            ? "fertilizer-a"
            : "north-fertilize",
    );
    expect(isActionDraft(d)).toBe(true);
    expect(isActionDraft({ ...d, actorId: null })).toBe(false);
  });
  it("preserves old v2 saves with optional fields missing, and resets new data through the repository", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
    const old = createDemoState();
    delete old.serviceOffers;
    delete old.people[1].availability;
    delete old.assets[0].repairExpectedAt;
    saveFarm(storage, old);
    expect(loadFarm(storage)).toMatchObject({ error: null, state: old });
    const repo = new FarmRepository(storage);
    const d = consumption(old);
    await repo.confirm(d, {
      approved: true,
      draftId: d.id,
      expectedRevision: 0,
    });
    await repo.reset();
    const reset = JSON.parse(values.get(STORAGE_KEY)!);
    expect(reset.inventoryBalances[0].quantity).toBe(800);
    expect(reset.assets[0].availability).toBe("available");
    expect(reset.serviceOffers).toHaveLength(2);
    expect(reset.activityLog).toEqual([]);
    expect(reset.operationRecords).toEqual([]);
  });
});
