import { domainMessage } from "../i18n/messages";
import type { FarmState } from "../domain/types";
import { selectFarmView } from "../domain/selectors";
import { migrateDemoEnglish } from "../domain/englishDemoMigration";
import { normalize, verifiedBagKg } from "../ai/documents";

export const INTERPRETER_LABEL = domainMessage("interpreterLabel");
export const EXAMPLES = [
  domainMessage("exampleFull"),
  domainMessage("exampleMissingField"),
  domainMessage("exampleMissingAmount"),
];
export type Interpretation =
  | { kind: "unsupported"; message: string }
  | {
      kind: "draft";
      fieldIds: string[];
      stockIds: string[];
      quantity: string;
      jobIds: string[];
      bagConversion?: {
        count: number;
        kg: number;
        sourceId: string;
        sectionId: string;
      };
      questions?: string[];
    };
export interface FarmInterpreter {
  interpret(
    text: string,
    state: FarmState,
  ): Interpretation | Promise<Interpretation>;
}

// Historical input aliases remain for saved/demo examples, not for UI output.
const aliases = (text: string) =>
  normalize(text)
    .replace(/\bkuzey\b/g, "north")
    .replace(/\bguney\b/g, "south")
    .replace(/\bdogu\b/g, "east")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]$/, "");

// A deliberately narrow grammar, not an AI simulation. No repository access.
export const demoInterpreter: FarmInterpreter = {
  interpret(text, source) {
    const state = selectFarmView(migrateDemoEnglish(source).state);
    const value = aliases(text);
    const place =
      "(north and east|east and north|north ve east|east ve north|north|south|east)";
    const amount = "(\\d+(?:[.,]\\d{1,3})?)";
    const legacy = value.match(
      new RegExp(
        `^(?:${place}(?: tarlasinda| tarlalarinda)? )?(?:${amount} kg )?(gubre|demo gubre a) kullandim$`,
      ),
    );
    const english = value.match(
      new RegExp(
        `^(i|ali) used (?:${amount} (kg|kilograms?|bags?) (?:of )?)?(fertilizer|demo fertilizer a|demo gubre a)(?: (?:in|on) (?:the )?${place}(?: field)?)?$`,
      ),
    );
    if (!legacy && !english)
      return {
        kind: "unsupported",
        message: domainMessage("errorUnsupported"),
      };
    const fieldText = legacy ? legacy[1] : english![5];
    let quantity = (legacy ? legacy[2] : english![2]) ?? "";
    const fieldIds = fieldText
      ? state.fields
          .filter((field) => fieldText.includes(normalize(field.name)))
          .map((field) => field.id)
      : [];
    const material = legacy ? legacy[3] : english![4];
    const stockIds = state.stocks
      .filter((stock) => {
        const product = source.products.find(
          (p) =>
            p.id ===
            source.inventoryBalances.find((b) => b.id === stock.id)?.productId,
        );
        return material.startsWith("demo ")
          ? stock.name === "Demo Fertilizer A"
          : product?.kind === "fertilizer";
      })
      .map((stock) => stock.id);
    const person =
      english?.[1] === "ali"
        ? source.people.find((p) => normalize(p.name) === "ali kaya")
        : null;
    const jobIds = state.jobs
      .filter(
        (job) =>
          job.status === "planned" &&
          job.type === "fertilizing" &&
          (!fieldIds.length || fieldIds.includes(job.fieldId)) &&
          job.stockId &&
          stockIds.includes(job.stockId) &&
          (english?.[1] !== "ali" || (person && job.personId === person.id)),
      )
      .map((job) => job.id);
    if (english?.[3]?.startsWith("bag") && quantity) {
      const balance =
        stockIds.length === 1
          ? source.inventoryBalances.find((b) => b.id === stockIds[0])
          : null;
      const kg = verifiedBagKg(balance?.productId ?? null);
      if (kg === null)
        return {
          kind: "draft",
          fieldIds,
          stockIds,
          jobIds,
          quantity: "",
          questions: ["bagSize"],
        };
      const count = Number(quantity.replace(",", "."));
      quantity = String(Math.round(count * kg * 1000) / 1000);
      return {
        kind: "draft",
        fieldIds,
        stockIds,
        jobIds,
        quantity,
        bagConversion: {
          count,
          kg,
          sourceId: "doc-fertilizer-a",
          sectionId: "packaging",
        },
      };
    }
    return { kind: "draft", fieldIds, stockIds, quantity, jobIds };
  },
};
