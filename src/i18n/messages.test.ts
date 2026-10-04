import { describe, expect, it } from "vitest";
import en from "./en.json";
import {
  dataText,
  domainMessage,
  localizeFarm,
  localizeMessage,
  translate,
} from "./messages";
import { language, useLanguage } from "./index";
import { createDemoState } from "../domain/demo";
import {
  confirmOperation,
  createPlannedJob,
  getShortages,
  previewOperation,
} from "../domain/operations";
import { demoInterpreter } from "../interpreter/demoInterpreter";

describe("English-only interface preserves farm records", () => {
  it("always selects English and keeps interpolation fields working", () => {
    expect(language()).toBe("en");
    expect(useLanguage()).toBe("en");
    for (const key of Object.keys(en) as (keyof typeof en)[])
      expect(translate(key, {}, "tr")).toBe(en[key]);
    expect(domainMessage("errorAvailable", { quantity: 800.5 })).toContain(
      "800.5 kg",
    );
  });
  it("shows English demo names without changing stored identifiers or data", () => {
    const state = createDemoState();
    const before = structuredClone(state);
    const display = localizeFarm(state, "tr");
    expect(display.jobs[0].title).toBe("Fertilize North");
    expect(display.fields[0].crop).toBe("Wheat");
    expect(display.machines[0].name).toBe("Red tractor");
    expect(display.warehouses[0].name).toBe("Main warehouse");
    expect(display.people[1].role).toBe("Farm worker");
    expect(display.jobs.map((job) => job.id)).toEqual(
      state.tasks.map((job) => job.id),
    );
    expect(state).toEqual(before);
  });
  it("preserves user job names and free text, even when similar to seed names", () => {
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
  it("preserves preview, confirmation and duplicate protection in English", () => {
    const state = createDemoState();
    const draft = {
      id: "locale-demo",
      jobId: "north-fertilize",
      fieldId: "north",
      stockId: "fertilizer-a",
      quantity: "600",
    };
    expect(previewOperation(localizeFarm(state), draft).after).toBe(200);
    const next = confirmOperation(state, draft, state.revision);
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(getShortages(localizeFarm(next))[0].missing).toBe(100);
    expect(
      confirmOperation(next, draft, next.revision).inventoryTransactions,
    ).toHaveLength(1);
    expect(next.tasks[0].title).toBe("Fertilize North");
  });
  it("still resolves historical input to the same IDs as English input", async () => {
    const state = createDemoState();
    const historical = await demoInterpreter.interpret(
      "Kuzey tarlasında 600 kg gübre kullandım",
      state,
    );
    const english = await demoInterpreter.interpret(en.exampleFull, state);
    expect(historical).toEqual(english);
    expect(english.kind).toBe("draft");
  });
  it("keeps validation errors and physical amounts English despite an old locale", () => {
    const error =
      domainMessage("errorChooseField") +
      " " +
      domainMessage("errorChooseMaterial");
    expect(localizeMessage(error, "tr")).toBe(
      en.errorChooseField + " " + en.errorChooseMaterial,
    );
    expect(
      localizeMessage(
        domainMessage("errorAvailable", { quantity: 800.5 }),
        "tr",
      ),
    ).toContain("800.5 kg");
    expect(localizeMessage(domainMessage("errorStale"), "tr")).toBe(
      en.errorStale,
    );
  });
});
