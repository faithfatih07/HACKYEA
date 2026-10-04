import en from "./en.json";
import tr from "./tr.json";
import { selectFarmView } from "../domain/selectors";
import type { FarmView, StateInput } from "../domain/selectors";

export type Language = "tr" | "en";
export type MessageKey = keyof typeof en;
export const dictionaries: Record<Language, Record<MessageKey, string>> = {
  en,
  tr,
};

export function translate(
  key: MessageKey,
  values: Record<string, unknown> = {},
  locale: Language = "en",
) {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? `{${name}}`),
  );
}

// Stable English messages keep the domain independent of the selected UI language.
export const domainMessage = (
  key: MessageKey,
  values: Record<string, unknown> = {},
) => translate(key, values, "en");

const dataKeys: MessageKey[] = [
  "cropWheat",
  "cropCorn",
  "cropBarley",
  "farmOwner",
  "roleWorker",
  "roleInventory",
  "redTractor",
  "fertilizerSpreader",
  "seedDrill",
  "trailer",
  "machineTractorNote",
  "machineSpreaderNote",
  "machineSeederNote",
  "machineTrailerNote",
  "mainWarehouse",
  "maintenanceWarehouse",
  "mainWarehouseDescription",
  "maintenanceWarehouseDescription",
  "afterFertilizing",
];
const seedJobs: Record<string, MessageKey> = {
  "north-fertilize": "northFertilize",
  "east-fertilize": "eastFertilize",
  "north-sow": "northSow",
};

export function dataText(value: string, locale: Language) {
  if (value === "Today") return translate("today", {}, locale);
  const key = dataKeys.find((key) => en[key] === value);
  return key ? translate(key, {}, locale) : value;
}

// This is a display copy only. Never persist translated records or translate user job names.
export function localizeFarm(input: StateInput, locale: Language): FarmView {
  const state = "domain" in input ? input : selectFarmView(input);
  return {
    ...state,
    fields: state.fields.map((field) => ({
      ...field,
      crop: dataText(field.crop, locale),
    })),
    people: state.people.map((person) => ({
      ...person,
      role: dataText(person.role, locale),
    })),
    machines: state.machines.map((machine) => ({
      ...machine,
      name: dataText(machine.name, locale),
      note: dataText(machine.note, locale),
    })),
    warehouses: state.warehouses.map((store) => ({
      ...store,
      name: dataText(store.name, locale),
      description: dataText(store.description, locale),
    })),
    jobs: state.jobs.map((job) => {
      const key = seedJobs[job.id];
      return {
        ...job,
        title:
          key && job.title === en[key] ? translate(key, {}, locale) : job.title,
        scheduled: dataText(job.scheduled, locale),
      };
    }),
  };
}

export function localizeMessage(value: string, locale: Language) {
  if (!value) return value;
  const exact = (Object.keys(en) as MessageKey[]).find(
    (key) => en[key] === value || tr[key] === value,
  );
  if (exact) return translate(exact, {}, locale);
  // Validation may join several errors. Translate each known sentence independently.
  let result = value;
  for (const key of Object.keys(en) as MessageKey[]) {
    if (key.startsWith("error") && !en[key].includes("{")) {
      result = result.replaceAll(en[key], dictionaries[locale][key]);
    }
  }
  return result.replace(
    /Only ([\d.]+) kg is physically available\. Reduce the amount before confirming\./g,
    (_, quantity: string) =>
      translate(
        "errorAvailable",
        {
          quantity: new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
            maximumFractionDigits: 3,
          }).format(Number(quantity)),
        },
        locale,
      ),
  );
}
