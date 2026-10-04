import { z } from "zod";
import type { FarmState } from "../domain/types";

const id = z.string().min(1).max(100);
const nullableId = id.nullable();
const strings = z.array(z.string().min(1).max(400)).max(12);
const quantity = z.number().finite().positive().max(1_000_000).nullable();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
export const operationSchema = z
  .object({
    mode: z.literal("OPERATION_ACTION"),
    intentType: z.enum([
      "recordConsumption",
      "setAssetAvailability",
      "rescheduleTask",
    ]),
    targetEntityIds: z
      .object({
        taskId: nullableId,
        fieldId: nullableId,
        productId: nullableId,
        inventoryBalanceId: nullableId,
        assetId: nullableId,
        personId: nullableId,
      })
      .strict(),
    extractedFields: z
      .object({
        quantity,
        unit: z.enum(["kg", "bag"]).nullable(),
        availability: z
          .enum(["available", "broken", "unavailable", "unknown"])
          .nullable(),
        date,
        startTime: time,
        endTime: time,
      })
      .strict(),
    missingFields: strings,
    ambiguities: strings,
    confidence: z.number().min(0).max(1),
    userFacingSummary: z.string().min(1).max(600),
  })
  .strict();
export const sourceRefSchema = z
  .object({ sourceId: id, sectionId: id })
  .strict();
export const documentAnswerSchema = z
  .object({
    mode: z.literal("DOCUMENT_ANSWER"),
    answerType: z.enum(["packaging", "harvestWait", "unavailable"]),
    sourceRefs: z.array(sourceRefSchema).max(5),
    missingFields: strings,
  })
  .strict();
export const modelResultSchema = z.discriminatedUnion("mode", [
  operationSchema,
  documentAnswerSchema,
]);
export type OperationInterpretation = z.infer<typeof operationSchema>;
export type DocumentInterpretation = z.infer<typeof documentAnswerSchema>;
export type ModelResult = z.infer<typeof modelResultSchema>;
// No history, identities of other farms, preferences or documents provided by the client.
const named = z.object({ id, name: z.string().max(200) }).strict();
export const contextSchema = z
  .object({
    fields: z.array(named).max(100),
    people: z.array(named).max(100),
    assets: z
      .array(
        named
          .extend({
            kind: z.string().max(30),
            availability: z.enum([
              "available",
              "broken",
              "unavailable",
              "unknown",
            ]),
          })
          .strict(),
      )
      .max(100),
    products: z
      .array(named.extend({ unit: z.enum(["kg", "l"]) }).strict())
      .max(100),
    inventoryBalances: z
      .array(
        z
          .object({
            id,
            productId: id,
            storageLocationId: id,
            quantity: z.number().finite().min(0).max(1_000_000).nullable(),
          })
          .strict(),
      )
      .max(100),
    tasks: z
      .array(
        z
          .object({
            id,
            title: z.string().max(200),
            fieldId: id,
            personId: id,
            assetIds: z.array(id).max(100),
            productId: nullableId,
            inventoryBalanceId: nullableId,
            plannedQuantity: z
              .number()
              .finite()
              .min(0)
              .max(1_000_000)
              .nullable(),
            type: z.enum(["fertilizing", "sowing"]),
            schedule: z
              .object({ date, startTime: time, endTime: time })
              .strict(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type AIContext = z.infer<typeof contextSchema>;
export function selectAIContext(state: FarmState): AIContext {
  const own = <T extends { farmId: string }>(records: T[]) =>
    records.filter((r) => r.farmId === state.farm.id);
  return contextSchema.parse({
    fields: own(state.fields).map(({ id, name }) => ({ id, name })),
    people: own(state.people).map(({ id, name }) => ({ id, name })),
    assets: own(state.assets).map(({ id, name, kind, availability }) => ({
      id,
      name,
      kind,
      availability,
    })),
    products: own(state.products).map(({ id, name, unit }) => ({
      id,
      name,
      unit,
    })),
    inventoryBalances: own(state.inventoryBalances).map(
      ({ id, productId, storageLocationId, quantity }) => ({
        id,
        productId,
        storageLocationId,
        quantity,
      }),
    ),
    tasks: own(state.tasks)
      .filter((t) => t.status === "planned")
      .map(
        ({
          id,
          title,
          fieldId,
          personId,
          assetIds,
          productId,
          inventoryBalanceId,
          plannedQuantity,
          type,
          schedule,
        }) => ({
          id,
          title,
          fieldId,
          personId,
          assetIds,
          productId,
          inventoryBalanceId,
          plannedQuantity,
          type,
          schedule,
        }),
      ),
  });
}
export const requestSchema = z
  .object({
    text: z.string().trim().min(1).max(1500),
    language: z.enum(["tr", "en"]),
    mode: z.enum(["AUTO", "DOCUMENT_ANSWER"]),
    productId: nullableId,
    applicationDateTime: z.string().datetime({ offset: true }).nullable(),
    context: contextSchema.nullable(),
  })
  .strict();
export type AIRequest = z.infer<typeof requestSchema>;
export const apiResultSchema = z.discriminatedUnion("provider", [
  z
    .object({ provider: z.literal("gemini"), result: modelResultSchema })
    .strict(),
  z
    .object({
      provider: z.literal("demo"),
      reason: z.enum(["no_key", "unavailable", "invalid_output"]),
    })
    .strict(),
]);
export type APIResult = z.infer<typeof apiResultSchema>;
export function parseModelResult(value: unknown): ModelResult {
  return modelResultSchema.parse(
    typeof value === "string" ? JSON.parse(value) : value,
  );
}
