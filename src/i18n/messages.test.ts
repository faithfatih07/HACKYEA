import { describe, expect, it } from "vitest";
import en from "./en.json";
import tr from "./tr.json";
import {
  dataText,
  domainMessage,
  localizeFarm,
  localizeMessage,
} from "./messages";
import { selectFarmView } from "../domain/selectors";
import { createDemoState } from "../domain/demo";
import {
  confirmOperation,
  createPlannedJob,
  getShortages,
  previewOperation,
} from "../domain/operations";
import { demoInterpreter } from "../interpreter/demoInterpreter";

describe("language support preserves farm records", () => {
  it("has matching keys and interpolation fields in both languages", () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(tr[key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(
        en[key].match(/\{\w+\}/g)?.sort() ?? [],
      );
    }
  });
  it("translates sample records without changing stored data or identifiers", () => {
    const state = createDemoState();
    const before = structuredClone(state);
    const display = localizeFarm(state, "tr");
    expect(display.jobs[0].title).toBe("Kuzey gübreleme");
    expect(display.fields[0].crop).toBe("Buğday");
    expect(display.machines[0].name).toBe("Kırmızı traktör");
    expect(display.warehouses[0].name).toBe("Ana depo");
    expect(display.people[1].role).toBe("Çiftlik çalışanı");
    expect(display.stocks).toEqual(selectFarmView(state).stocks);
    expect(display.jobs.map((job) => job.id)).toEqual(
      state.tasks.map((job) => job.id),
    );
    expect(state).toEqual(before);
  });
  it("preserves user job names, including names similar to demo jobs", () => {
    const state = createPlannedJob(
      createDemoState(),
      {
        title: "Fertilize Kuzey",
        fieldId: "north",
        personId: "ali",
        machineIds: ["tractor"],
        stockId: "fertilizer-a",
        quantity: "100",
        dependencyId: "",
      },
      "custom-job",
    );
    state.tasks[0].title = "Benim yeni iş adım";
    const display = localizeFarm(state, "tr");
    expect(display.jobs.find((job) => job.id === "custom-job")?.title).toBe(
      "Fertilize Kuzey",
    );
    expect(display.jobs[0].title).toBe("Benim yeni iş adım");
    expect(dataText("Custom crop", "tr")).toBe("Custom crop");
  });
  it("preserves preview, confirmation and duplicate protection in Turkish", () => {
    const state = createDemoState();
    const draft = {
      id: "locale-demo",
      jobId: "north-fertilize",
      fieldId: "north",
      stockId: "fertilizer-a",
      quantity: "600",
    };
    expect(previewOperation(localizeFarm(state, "tr"), draft).after).toBe(200);
    const next = confirmOperation(state, draft, state.revision);
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(getShortages(localizeFarm(next, "tr"))[0].missing).toBe(100);
    expect(
      confirmOperation(next, draft, next.revision).inventoryTransactions,
    ).toHaveLength(1);
    expect(next.tasks[0].title).toBe("Fertilize Kuzey");
  });
  it("resolves Turkish and English interpreter input to the same raw records", async () => {
    const state = createDemoState();
    const turkish = await demoInterpreter.interpret(tr.exampleFull, state);
    const english = await demoInterpreter.interpret(en.exampleFull, state);
    expect(turkish).toEqual(english);
    expect(turkish.kind).toBe("draft");
  });
  it("translates joined validation errors and physical stock amounts", () => {
    const error =
      domainMessage("errorChooseField") +
      " " +
      domainMessage("errorChooseMaterial");
    expect(localizeMessage(error, "tr")).toBe(
      "Bir tarla seçin. Bir malzeme seçin.",
    );
    expect(
      localizeMessage(
        domainMessage("errorAvailable", { quantity: 800.5 }),
        "tr",
      ),
    ).toContain("800,5 kg");
    expect(localizeMessage(domainMessage("errorStale"), "tr")).toBe(
      tr.errorStale,
    );
    expect(localizeMessage(tr.jobPlanned, "en")).toBe(en.jobPlanned);
  });
});
