import { domainMessage, translate } from "../i18n/messages";
import type { FarmState } from "../domain/types";
import { selectFarmView } from "../domain/selectors";

export const INTERPRETER_LABEL = domainMessage("interpreterLabel");
export const EXAMPLES = [
  translate("exampleFull", {}, "tr"),
  domainMessage("exampleFull"),
  translate("exampleMissingField", {}, "tr"),
];
export type Interpretation =
  | { kind: "unsupported"; message: string }
  | {
      kind: "draft";
      fieldIds: string[];
      stockIds: string[];
      quantity: string;
      jobIds: string[];
    };

export interface FarmInterpreter {
  interpret(
    text: string,
    state: FarmState,
  ): Interpretation | Promise<Interpretation>;
}
const normalize = (text: string) =>
  text
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]$/, "");

// An intentionally narrow grammar, not an AI simulation. Unknown text is never guessed.
export const demoInterpreter: FarmInterpreter = {
  interpret(text, source) {
    const state = selectFarmView(source);
    const value = normalize(text);
    const place = "(kuzey|guney|dogu|kuzey ve dogu|dogu ve kuzey)";
    const amount = "(\\d+(?:[.,]\\d{1,3})?)";
    const turkish = new RegExp(
      `^(?:${place}(?: tarlasinda| tarlalarinda)? )?(?:${amount} kg )?(gubre|demo gubre a) kullandim$`,
    );
    const english = new RegExp(
      `^i used (?:${amount} kg )?(fertilizer|demo gubre a)(?: (?:in|on) ${place}(?: field)?)?$`,
    );
    const tr = value.match(turkish);
    const en = value.match(english);
    if (!tr && !en)
      return {
        kind: "unsupported",
        message: domainMessage("errorUnsupported"),
      };
    const fieldText = tr ? tr[1] : en![3];
    const quantity = (tr ? tr[2] : en![1]) ?? "";
    const fieldIds = fieldText
      ? state.fields
          .filter((field) => fieldText.includes(normalize(field.name)))
          .map((field) => field.id)
      : [];
    const materialText = tr ? tr[3] : en![2];
    const stockIds = state.stocks
      .filter((stock) =>
        materialText === "demo gubre a"
          ? normalize(stock.name) === materialText
          : normalize(stock.name).includes("gubre"),
      )
      .map((stock) => stock.id);
    const jobIds = state.jobs
      .filter(
        (job) =>
          job.status === "planned" &&
          job.type === "fertilizing" &&
          (fieldIds.length === 0 || fieldIds.includes(job.fieldId)) &&
          job.stockId &&
          stockIds.includes(job.stockId),
      )
      .map((job) => job.id);
    return { kind: "draft", fieldIds, stockIds, quantity, jobIds };
  },
};
