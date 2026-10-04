import { describe, expect, it } from "vitest";
import { createDemoState } from "./demo";
import {
  completeSowingJob,
  confirmOperation,
  createPlannedJob,
  getShortages,
  parseQuantity,
  previewOperation,
} from "./operations";
import { isFarmState, loadFarm, saveFarm } from "./storage";
import { demoInterpreter } from "../interpreter/demoInterpreter";
import type { OperationDraft } from "./types";

const draft: OperationDraft = {
  id: "operation-1",
  jobId: "north-fertilize",
  fieldId: "north",
  stockId: "fertilizer-a",
  quantity: "600",
};

describe("first farm scenario", () => {
  it("interprets the exact Turkish sentence without mutating farm data", async () => {
    const state = createDemoState();
    const before = JSON.stringify(state);
    expect(
      await demoInterpreter.interpret(
        "Kuzey tarlasında 600 kg gübre kullandım",
        state,
      ),
    ).toEqual({
      kind: "draft",
      fieldIds: ["north"],
      stockIds: ["fertilizer-a"],
      quantity: "600",
      jobIds: ["north-fertilize"],
    });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("previews 800 → 200, and a 100 kg shortfall for Doğu, with no mutations", () => {
    const state = createDemoState();
    const preview = previewOperation(state, draft);
    expect(preview.valid).toBe(true);
    expect(preview.stock?.quantity).toBe(800);
    expect(preview.after).toBe(200);
    expect(preview.shortages).toEqual([
      {
        stockId: "fertilizer-a",
        required: 300,
        available: 200,
        missing: 100,
        jobIds: ["east-fertilize"],
      },
    ]);
    expect(state.inventoryBalances[0].quantity).toBe(800);
    expect(state.inventoryTransactions).toHaveLength(0);
    expect(state.tasks[0].status).toBe("planned");
  });
  it("atomically completes the job, stores consumption and deducts stock only after confirmation", () => {
    const initial = createDemoState();
    const next = confirmOperation(
      initial,
      draft,
      0,
      "2026-10-04T08:00:00.000Z",
    );
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(next.tasks[0].status).toBe("completed");
    expect(next.tasks[1].status).toBe("planned");
    expect(next.inventoryTransactions).toHaveLength(1);
    expect(next.inventoryTransactions[0]).toMatchObject({
      quantity: 600,
      before: 800,
      after: 200,
      inventoryBalanceId: "fertilizer-a",
    });
    expect(initial.inventoryBalances[0].quantity).toBe(800);
    expect(isFarmState(next)).toBe(true);
    expect(getShortages(next)[0].missing).toBe(100);
  });
  it("is idempotent for double confirmations, stale retries, and a new operation ID for the same job", () => {
    const once = confirmOperation(createDemoState(), draft, 0);
    expect(confirmOperation(once, draft, 0)).toBe(once);
    expect(confirmOperation(once, { ...draft, id: "different-id" }, 1)).toBe(
      once,
    );
    expect(once.inventoryBalances[0].quantity).toBe(200);
    expect(once.inventoryTransactions).toHaveLength(1);
  });
  it("persists completion and idempotency across storage reloads", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    saveFarm(storage, confirmOperation(createDemoState(), draft, 0));
    const loaded = loadFarm(storage);
    expect(loaded.error).toBeNull();
    expect(loaded.state.inventoryBalances[0].quantity).toBe(200);
    expect(
      confirmOperation(loaded.state, draft, 0).inventoryTransactions,
    ).toHaveLength(1);
  });
});

describe("validation and planning", () => {
  it.each([
    "",
    "0",
    "-5",
    "600 kg",
    "NaN",
    "Infinity",
    "1e3",
    "1,000,000",
    "0.0001",
    "1000001",
  ])("rejects invalid amount %s", (quantity) => {
    expect(parseQuantity(quantity)).toBeNull();
    expect(
      previewOperation(createDemoState(), { ...draft, quantity }).valid,
    ).toBe(false);
  });
  it("handles decimal input and arithmetic precisely to grams", () => {
    expect(parseQuantity("600,125")).toBe(600.125);
    expect(
      previewOperation(createDemoState(), { ...draft, quantity: "600.125" })
        .after,
    ).toBe(199.875);
  });
  it("blocks insufficient physical stock, mismatched links and outdated previews", () => {
    const state = createDemoState();
    expect(() =>
      confirmOperation(state, { ...draft, quantity: "801" }, 0),
    ).toThrow("physically available");
    expect(() =>
      confirmOperation(state, { ...draft, fieldId: "east" }, 0),
    ).toThrow("field linked");
    expect(() =>
      confirmOperation(state, { ...draft, stockId: "missing" }, 0),
    ).toThrow("material");
    expect(() => confirmOperation(state, draft, 99)).toThrow(
      "Farm data changed",
    );
    expect(state.inventoryBalances[0].quantity).toBe(800);
  });
  it("creating a plan preserves physical stock and changes planning shortage only", () => {
    const initial = createDemoState();
    const next = createPlannedJob(
      initial,
      {
        title: "Fertilize Güney",
        fieldId: "south",
        personId: "ali",
        machineIds: ["tractor", "spreader"],
        stockId: "fertilizer-a",
        quantity: "100",
        dependencyId: "",
      },
      "south-fertilize",
    );
    expect(next.tasks).toHaveLength(4);
    expect(next.inventoryBalances[0].quantity).toBe(800);
    expect(next.inventoryTransactions).toHaveLength(0);
    expect(getShortages(next)[0].missing).toBe(200);
  });
  it("enforces the sowing prerequisite and completes without fictional seed consumption", () => {
    expect(() => completeSowingJob(createDemoState(), "north-sow")).toThrow(
      "prerequisite",
    );
    const fertilized = confirmOperation(createDemoState(), draft, 0);
    const sown = completeSowingJob(fertilized, "north-sow");
    expect(sown.tasks[2].status).toBe("completed");
    expect(sown.inventoryBalances[0].quantity).toBe(200);
    expect(sown.inventoryTransactions).toHaveLength(1);
  });
  it("blocks fertilizer plans with an unfinished dependency", () => {
    const state = createDemoState();
    state.tasks[0].dependencyId = "east-fertilize";
    expect(() => confirmOperation(state, draft, 0)).toThrow("prerequisite");
  });
  it("detects malformed or incompatible storage and surfaces save failures", () => {
    expect(
      loadFarm({ getItem: () => "{bad", setItem: () => {} }).error,
    ).not.toBeNull();
    expect(isFarmState({ ...createDemoState(), version: 3 })).toBe(false);
    expect(
      isFarmState({
        ...createDemoState(),
        inventoryBalances: [{ id: "bad", quantity: -3 }],
      }),
    ).toBe(false);
    expect(() =>
      saveFarm(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        createDemoState(),
      ),
    ).toThrow("Nothing was applied");
  });
  it("reset returns a separate complete original dataset", () => {
    const changed = confirmOperation(createDemoState(), draft, 0);
    const reset = createDemoState();
    expect(reset.inventoryBalances[0].quantity).toBe(800);
    expect(reset.tasks.every((job) => job.status === "planned")).toBe(true);
    expect(reset.inventoryTransactions).toHaveLength(0);
    expect(changed.inventoryBalances[0].quantity).toBe(200);
  });
});

describe("honest local interpreter", () => {
  it("accepts the documented English example", async () => {
    expect(
      await demoInterpreter.interpret(
        "I used 600 kg fertilizer in Kuzey",
        createDemoState(),
      ),
    ).toMatchObject({
      kind: "draft",
      fieldIds: ["north"],
      quantity: "600",
      jobIds: ["north-fertilize"],
    });
  });
  it("leaves missing and ambiguous details for the user to choose", async () => {
    expect(
      await demoInterpreter.interpret(
        "600 kg gübre kullandım",
        createDemoState(),
      ),
    ).toMatchObject({
      kind: "draft",
      fieldIds: [],
      jobIds: ["north-fertilize", "east-fertilize"],
    });
    expect(
      await demoInterpreter.interpret(
        "Kuzey tarlasında gübre kullandım",
        createDemoState(),
      ),
    ).toMatchObject({ kind: "draft", quantity: "" });
    expect(
      await demoInterpreter.interpret(
        "Kuzey ve Doğu tarlalarında 600 kg gübre kullandım",
        createDemoState(),
      ),
    ).toMatchObject({ kind: "draft", fieldIds: ["north", "east"] });
  });
  it.each([
    "Kuzey tarlasında 600 kg gübre kullanmadım",
    "How much fertilizer should I apply?",
    "Diagnose my wheat",
    "Kuzey tarlasında 600 kg gerçek ürün kullandım",
    "Kuzey tarlasında 600 kg gübre kullandım ve Doğu için 300 kg sipariş ver",
    "Yesterday I used something",
    "",
  ])("does not invent a result for %s", async (text) => {
    expect(
      await demoInterpreter.interpret(text, createDemoState()),
    ).toMatchObject({ kind: "unsupported" });
  });
  it("does not choose arbitrarily when a field has more than one matching job", async () => {
    const state = createDemoState();
    state.tasks.push({ ...state.tasks[0], id: "north-second" });
    expect(
      await demoInterpreter.interpret(
        "Kuzey tarlasında 600 kg gübre kullandım",
        state,
      ),
    ).toMatchObject({
      kind: "draft",
      jobIds: ["north-fertilize", "north-second"],
    });
  });
});
