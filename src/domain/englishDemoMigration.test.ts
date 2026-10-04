import { describe, expect, it } from "vitest";
import { createDemoState } from "./demo";
import { migrateDemoEnglish } from "./englishDemoMigration";
import { FarmRepository } from "./repository";
import { loadFarm, STORAGE_KEY } from "./storage";
import { confirmOperation, consumptionAction } from "./operations";
import { previewAction } from "./actions";
import { demoInterpreter } from "../interpreter/demoInterpreter";

// Exact historical text is a fixture, not current interface content.
function historicalState() {
  const state = createDemoState();
  state.farm.name = "Murat’ın Çiftliği";
  state.fields[0].name = "Kuzey";
  state.fields[1].name = "Güney";
  state.fields[2].name = "Doğu";
  state.fields[0].crop = "Buğday";
  state.products[0].name = "Demo Gübre A";
  state.tasks[0].title = "Fertilize Kuzey";
  state.tasks[1].title = "Doğu gübreleme";
  state.assets[0].name = "Kırmızı traktör";
  state.assets[0].note =
    "Kuzey ve Doğu gübreleme planlarında ortak kullanılır.";
  state.storageLocations[0].description = "Ana depo · Materials for field work";
  state.documentSources.push({
    id: "doc-fertilizer-a",
    farmId: "murat-farm",
    title: "Demo Gübre A Ürün Kimlik Kartı",
    productId: "product-fertilizer-a",
    uri: "demo:fertilizer-a",
    verification: "verified",
    verifiedAt: "2026-10-04T00:00:00Z",
    verifiedById: "murat",
  });
  return state;
}
function memory(value: unknown) {
  const data = new Map([
    [STORAGE_KEY, JSON.stringify(value)],
    ["fieldnote.language", "tr"],
  ]);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}
describe("safe English demo migration", () => {
  it("translates known seed fields by ID, preserving quantities and identifiers", () => {
    const old = historicalState(),
      before = structuredClone(old);
    const migrated = migrateDemoEnglish(old);
    expect(migrated.changed).toBe(true);
    expect(migrated.state.fields.map((f) => f.name)).toEqual([
      "North",
      "South",
      "East",
    ]);
    expect(migrated.state.products[0].name).toBe("Demo Fertilizer A");
    expect(migrated.state.tasks[0].title).toBe("Fertilize North");
    expect(migrated.state.assets[0].name).toBe("Red tractor");
    expect(migrated.state.storageLocations[0].description).toBe(
      "Main warehouse · Materials for field work",
    );
    expect(migrated.state.inventoryBalances).toEqual(old.inventoryBalances);
    expect(migrated.state.documentSources[0].id).toBe(
      old.documentSources[0].id,
    );
    expect(migrated.state.revision).toBe(old.revision);
    expect(old).toEqual(before);
    expect(migrateDemoEnglish(migrated.state)).toEqual({
      state: migrated.state,
      changed: false,
    });
  });
  it("does not change free notes, customized names, arbitrary records or another farm", () => {
    const state = historicalState();
    state.assets[0].note = "Bugün yağ değiştirildi. Kullanıcının serbest notu.";
    state.tasks[0].title = "Benim kuzey işi";
    state.fields.push({ ...state.fields[0], id: "custom-field" });
    const next = migrateDemoEnglish(state).state;
    expect(next.assets[0].note).toBe(state.assets[0].note);
    expect(next.tasks[0].title).toBe(state.tasks[0].title);
    expect(next.fields.at(-1)).toEqual(state.fields.at(-1));
    state.farm.id = "other-farm";
    expect(migrateDemoEnglish(state)).toEqual({ state, changed: false });
  });
  it("persists once under the repository lock, preserving completed operations and old preferences", async () => {
    const state = confirmOperation(
      historicalState(),
      {
        id: "previous-operation",
        jobId: "north-fertilize",
        fieldId: "north",
        stockId: "fertilizer-a",
        quantity: "600",
      },
      0,
    );
    const storage = memory(state);
    const original = storage.getItem(STORAGE_KEY);
    expect(loadFarm(storage).migrated).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
    const repo = new FarmRepository(storage);
    await repo.ready;
    const saved = repo.getSnapshot().state;
    expect(saved.fields[0].name).toBe("North");
    expect(saved.inventoryBalances[0].quantity).toBe(200);
    expect(saved.operationRecords).toEqual(state.operationRecords);
    expect(saved.inventoryTransactions).toEqual(state.inventoryTransactions);
    expect(saved.activityLog).toEqual(state.activityLog);
    expect(saved.tasks[0].status).toBe("completed");
    expect(storage.getItem("fieldnote.language")).toBe("tr");
    const once = storage.getItem(STORAGE_KEY);
    const second = new FarmRepository(storage);
    await second.ready;
    expect(storage.getItem(STORAGE_KEY)).toBe(once);
    expect(loadFarm(storage).migrated).toBe(false);
  });
  it.each(["fresh", "historical"])(
    "interprets English bags with verified provenance and unchanged %s stock before approval",
    async (kind) => {
      const state = kind === "fresh" ? createDemoState() : historicalState();
      const before = structuredClone(state);
      const result = await demoInterpreter.interpret(
        "Ali used 12 bags of fertilizer in the North Field",
        state,
      );
      expect(result).toMatchObject({
        kind: "draft",
        fieldIds: ["north"],
        jobIds: ["north-fertilize"],
        quantity: "600",
        bagConversion: {
          count: 12,
          kg: 50,
          sourceId: "doc-fertilizer-a",
          sectionId: "packaging",
        },
      });
      if (result.kind !== "draft") throw new Error("Expected a draft");
      const action = consumptionAction(state, {
        id: "english-bags",
        jobId: result.jobIds[0],
        fieldId: result.fieldIds[0],
        stockId: result.stockIds[0],
        quantity: result.quantity,
      });
      const preview = previewAction(state, action);
      expect(preview.valid).toBe(true);
      expect(preview.impacts).toContainEqual(
        expect.objectContaining({
          kind: "remainingStock",
          values: { before: 800, used: 600, after: 200 },
        }),
      );
      expect(
        preview.impacts.some(
          (i) =>
            i.values.missing === 100 &&
            i.evidenceRefs.some((r) => r.id === "east-fertilize"),
        ),
      ).toBe(true);
      expect(state).toEqual(before);
    },
  );
  it("resets to English demo seeds only when explicitly requested", async () => {
    const repo = new FarmRepository(memory(historicalState()));
    await repo.ready;
    const reset = await repo.reset();
    expect(reset.fields[0].name).toBe("North");
    expect(reset.inventoryBalances[0].quantity).toBe(800);
    expect(reset.operationRecords).toEqual([]);
  });
});
