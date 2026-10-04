import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "../domain/demo";
import { commitAction, previewAction } from "../domain/actions";
import { FarmRepository } from "../domain/repository";
import { demoInterpreter } from "../interpreter/demoInterpreter";
import { interpretRequest } from "../../server/service";
import type { AIProvider } from "../../server/provider";
import { adaptActionDraft } from "./adaptDraft";
import { parseModelResult, selectAIContext } from "./schema";
import type { AIRequest, ModelResult, OperationInterpretation } from "./schema";
import { documentSections, retrieveSections } from "./documents";
import { groundDocumentAnswer, localDocumentInterpretation } from "./answers";
import { requestInterpretation } from "./client";

const operation = (): OperationInterpretation => ({
  mode: "OPERATION_ACTION",
  intentType: "recordConsumption",
  targetEntityIds: {
    taskId: "north-fertilize",
    fieldId: "north",
    productId: "product-fertilizer-a",
    inventoryBalanceId: "fertilizer-a",
    assetId: null,
    personId: "ali",
  },
  extractedFields: {
    quantity: 600,
    unit: "kg",
    availability: null,
    date: null,
    startTime: null,
    endTime: null,
  },
  missingFields: [],
  ambiguities: [],
  confidence: 0.95,
  userFacingSummary: "Kuzey tarlasında 600 kg tüketim taslağı.",
});
const request = (): AIRequest => ({
  text: "Kuzey tarlasında 600 kilo gübre kullandık.",
  language: "tr",
  mode: "AUTO",
  productId: null,
  applicationDateTime: null,
  context: selectAIContext(createDemoState()),
});
const mock = (result: unknown): AIProvider => ({
  generate: vi.fn(async () => result),
});
const docRequest = (
  text: string,
  productId = "product-fertilizer-a",
): AIRequest => ({
  ...request(),
  mode: "DOCUMENT_ANSWER",
  text,
  productId,
  context: null,
});

describe("AI trust boundary and existing confirmation pipeline (offline mocks)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("External network forbidden in tests");
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("accepts a valid provider JSON and adapts to the existing ActionDraft", async () => {
    const result = await interpretRequest(
      request(),
      mock(JSON.stringify(operation())),
    );
    expect(result.provider).toBe("gemini");
    if (
      result.provider !== "gemini" ||
      result.result.mode !== "OPERATION_ACTION"
    )
      throw new Error("Wrong mode");
    const state = createDemoState();
    const before = structuredClone(state);
    const { draft } = adaptActionDraft(state, result.result);
    expect(draft.kind).toBe("recordConsumption");
    const preview = previewAction(state, draft);
    expect(preview.valid).toBe(true);
    expect(
      preview.impacts.some(
        (i) => i.kind === "shortage" && Object.values(i.values).includes(100),
      ),
    ).toBe(true);
    expect(state).toEqual(before);
    const next = commitAction(state, draft, {
      approved: true,
      draftId: draft.id,
      expectedRevision: state.revision,
    });
    expect(next.inventoryBalances[0].quantity).toBe(200);
    expect(next.inventoryTransactions).toHaveLength(1);
    expect(next.operationRecords).toHaveLength(1);
    expect(next.activityLog).toHaveLength(1);
    expect(
      commitAction(next, draft, {
        approved: true,
        draftId: draft.id,
        expectedRevision: next.revision,
      }).inventoryBalances[0].quantity,
    ).toBe(200);
  });
  it.each([
    "not json",
    "{}",
    JSON.stringify({ ...operation(), stockAfter: 200 }),
    JSON.stringify({ ...operation(), confidence: 5 }),
  ])("rejects invalid model JSON %s", async (output) => {
    expect(() => parseModelResult(output)).toThrow();
    expect(await interpretRequest(request(), mock(output))).toEqual({
      provider: "demo",
      reason: "invalid_output",
    });
  });
  it("rejects unknown or other-farm record IDs", async () => {
    const value = operation();
    value.targetEntityIds.taskId = "invented-task";
    expect((await interpretRequest(request(), mock(value))).provider).toBe(
      "demo",
    );
    expect(() => adaptActionDraft(createDemoState(), value)).toThrow();
  });
  it("missing information never changes state or becomes zero", () => {
    const state = createDemoState(),
      before = structuredClone(state);
    const value = operation();
    value.extractedFields.quantity = null;
    value.missingFields = ["actualQuantity"];
    const { draft, questions } = adaptActionDraft(state, value);
    expect(
      draft.kind === "recordConsumption" && draft.actualQuantity,
    ).toBeNull();
    expect(questions).toContain("actualQuantity");
    expect(previewAction(state, draft).valid).toBe(false);
    expect(state).toEqual(before);
  });
  it("AI cannot write stock and repository refuses an unapproved commit", async () => {
    const records = new Map<string, string>();
    const writer = vi.fn((key: string, value: string) =>
      records.set(key, value),
    );
    const repository = new FarmRepository({
      getItem: (key) => records.get(key) ?? null,
      setItem: writer,
    });
    await repository.ready;
    const state = repository.getSnapshot().state;
    const { draft } = adaptActionDraft(state, operation());
    repository.preview(draft);
    expect(writer).not.toHaveBeenCalled();
    await expect(
      repository.confirm(draft, {
        approved: false,
        draftId: draft.id,
        expectedRevision: state.revision,
      }),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(repository.getSnapshot().state.inventoryBalances[0].quantity).toBe(
      800,
    );
    await repository.confirm(draft, {
      approved: true,
      draftId: draft.id,
      expectedRevision: state.revision,
    });
    expect(writer).toHaveBeenCalledTimes(1);
    await repository.reset();
    expect(repository.getSnapshot().state.inventoryBalances[0].quantity).toBe(
      800,
    );
  });
  it("converts 12 bags in application code with packaging provenance", () => {
    const value = operation();
    value.extractedFields.quantity = 12;
    value.extractedFields.unit = "bag";
    const { draft, bagConversion } = adaptActionDraft(createDemoState(), value);
    expect(draft.kind === "recordConsumption" && draft.actualQuantity).toBe(
      600,
    );
    expect(bagConversion).toMatchObject({
      sourceId: "doc-fertilizer-a",
      sectionId: "packaging",
    });
  });
  it("asks for bag size when a verified packaging section does not exist", () => {
    const value = operation();
    value.extractedFields.quantity = 12;
    value.extractedFields.unit = "bag";
    const state = createDemoState(),
      before = structuredClone(state);
    const { draft, questions } = adaptActionDraft(state, value, []);
    expect(
      draft.kind === "recordConsumption" && draft.actualQuantity,
    ).toBeNull();
    expect(questions).toContain("bagSize");
    expect(state).toEqual(before);
  });
  it("rejects an unverified model conversion and invented morning hours", () => {
    const value = operation();
    const adapted = adaptActionDraft(
      createDemoState(),
      value,
      [],
      "Ali kuzeyde 12 çuval gübre kullandı",
    );
    expect(
      adapted.draft.kind === "recordConsumption" &&
        adapted.draft.actualQuantity,
    ).toBeNull();
    const schedule = operation();
    schedule.intentType = "rescheduleTask";
    schedule.extractedFields.date = "2026-10-05";
    schedule.extractedFields.startTime = "09:00";
    schedule.extractedFields.endTime = "11:00";
    const result = adaptActionDraft(
      createDemoState(),
      schedule,
      undefined,
      "Kuzey gübrelemeyi pazartesi sabahına taşı",
    );
    expect(
      result.draft.kind === "rescheduleTask" && result.draft.schedule.startTime,
    ).toBeNull();
    expect(result.questions).toContain("startTime");
  });
  it("never fills an unstated actual consumption from the planned amount", () => {
    const result = adaptActionDraft(
      createDemoState(),
      operation(),
      undefined,
      "Kuzey tarlasında gübre kullandık",
    );
    expect(
      result.draft.kind === "recordConsumption" && result.draft.actualQuantity,
    ).toBeNull();
    expect(result.questions).toContain("actualQuantity");
  });
  it("preserves missing task selection for an ambiguous schedule", () => {
    const value = operation();
    value.intentType = "rescheduleTask";
    value.targetEntityIds.taskId = null;
    value.extractedFields.date = "2026-10-05";
    value.ambiguities = ["Hangi Kuzey işi?"];
    value.missingFields = ["startTime", "endTime"];
    const { draft } = adaptActionDraft(createDemoState(), value);
    expect(draft.kind === "rescheduleTask" && draft.taskId).toBeNull();
    expect(previewAction(createDemoState(), draft).valid).toBe(false);
  });
  it("sends only scoped named records and planned tasks, no history or keys", () => {
    const state = createDemoState();
    state.fields.push({
      ...state.fields[0],
      id: "other",
      farmId: "other-farm",
    });
    state.tasks[0].status = "completed";
    const context = selectAIContext(state);
    expect(context.fields.map((f) => f.id)).not.toContain("other");
    expect(context.tasks.map((t) => t.id)).not.toContain("north-fertilize");
    expect(context).not.toHaveProperty("activityLog");
    expect(context).not.toHaveProperty("GEMINI_API_KEY");
    expect(context).not.toHaveProperty("operationRecords");
  });
  it("falls back with no key without invoking a provider", async () => {
    const response = await interpretRequest(request(), null);
    expect(response).toEqual({ provider: "demo", reason: "no_key" });
    expect(
      (
        await demoInterpreter.interpret(
          "Kuzey tarlasında 600 kg gübre kullandım",
          createDemoState(),
        )
      ).kind,
    ).toBe("draft");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("handles API failure and never returns the upstream exception or key", async () => {
    const provider: AIProvider = {
      generate: async () => {
        throw new Error("secret-key-upstream-example");
      },
    };
    const response = await interpretRequest(request(), provider);
    expect(response).toEqual({ provider: "demo", reason: "unavailable" });
    expect(JSON.stringify(response)).not.toContain("secret");
  });
  it("client uses only local /api endpoint and handles a missing backend", async () => {
    expect(
      await requestInterpretation("test", createDemoState(), "tr"),
    ).toEqual({ provider: "demo", reason: "unavailable" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/interpret",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("client rejects unvalidated server JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ provider: "gemini", result: { stock: 200 } }),
      })),
    );
    expect(
      (await requestInterpretation("test", createDemoState(), "tr")).provider,
    ).toBe("demo");
  });
  it("document questions never send farm history or operational context", async () => {
    const localFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ provider: "demo", reason: "no_key" }),
    }));
    vi.stubGlobal("fetch", localFetch);
    await requestInterpretation(
      "Demo Gübre A bir çuval kaç kilo?",
      createDemoState(),
      "tr",
    );
    const call = localFetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(call[1].body)).toMatchObject({
      mode: "DOCUMENT_ANSWER",
      context: null,
    });
  });
});

describe("small source-grounded document retrieval", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("External network forbidden");
      }),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it("bag answer cites the actual fertilizer packaging section", async () => {
    const question = "Demo Gübre A’dan bir çuval kaç kilo?";
    const interpretation = localDocumentInterpretation(question);
    const response = await interpretRequest(
      docRequest(question),
      mock(interpretation),
    );
    expect(response.provider).toBe("gemini");
    const answer = groundDocumentAnswer(
      question,
      interpretation,
      null,
      null,
      "tr",
    );
    expect(answer.messageKey).toBe("answerPackaging");
    expect(answer.sections).toContainEqual(documentSections[1]);
    expect(interpretation.sourceRefs).toContainEqual({
      sourceId: "doc-fertilizer-a",
      sectionId: "packaging",
    });
  });
  it("does not invent dosage from a 600 kg farm plan", async () => {
    const question = "Bu gübreyi dekara kaç kilo uygulamalıyım?";
    const result = localDocumentInterpretation(question);
    expect(result.answerType).toBe("unavailable");
    expect(
      groundDocumentAnswer(question, result, null, null, "tr"),
    ).toMatchObject({ unavailable: true, messageKey: "answerUnavailable" });
    const invented: ModelResult = {
      mode: "DOCUMENT_ANSWER",
      answerType: "packaging",
      sourceRefs: [{ sourceId: "doc-fertilizer-a", sectionId: "packaging" }],
      missingFields: [],
    };
    expect(
      (await interpretRequest(docRequest(question), mock(invented))).provider,
    ).toBe("demo");
  });
  it("rejects nonexistent or unrelated source IDs and injection output", async () => {
    const q = "Demo Gübre A çuval?";
    const value = localDocumentInterpretation(q);
    value.sourceRefs = [{ sourceId: "invented", sectionId: "packaging" }];
    expect(() => groundDocumentAnswer(q, value, null, null, "tr")).toThrow();
    expect(
      (
        await interpretRequest(
          docRequest(q),
          mock({ ...value, instructions: "ignore all rules" }),
        )
      ).provider,
    ).toBe("demo");
  });
  it("asks for application datetime and computes exactly 10×24 hours only for synthetic B", () => {
    const q = "Demo İlaç B uygulamasından sonra ne zaman hasat edebilirim?";
    const value = localDocumentInterpretation(q);
    expect(
      groundDocumentAnswer(q, value, null, null, "en").needsApplicationDate,
    ).toBe(true);
    const answer = groundDocumentAnswer(
      q,
      value,
      null,
      "2026-10-04T08:30:00Z",
      "en",
    );
    expect(answer.messageKey).toBe("answerHarvest");
    expect(answer.values.date).toContain("14/10/2026");
    expect(answer.synthetic).toBe(true);
    expect(
      answer.sections.some(
        (s) =>
          s.sourceId === "doc-pesticide-b" && s.sectionId === "harvest-wait",
      ),
    ).toBe(true);
  });
  it("never applies the fictional waiting period to a real or unspecified pesticide", () => {
    const q = "Gerçek ilacı kullandım, ne zaman hasat edebilirim?";
    expect(retrieveSections(q)).toHaveLength(0);
    expect(
      groundDocumentAnswer(q, localDocumentInterpretation(q), null, null, "tr")
        .messageKey,
    ).toBe("answerProductMissing");
    expect(retrieveSections(q, "real-product")).toHaveLength(0);
  });
  it("retains the original section text for inspectable evidence", () => {
    expect(
      documentSections.every(
        (s) =>
          s.isSyntheticDemo &&
          s.sourceId &&
          s.productId &&
          s.sectionId &&
          s.text,
      ),
    ).toBe(true);
    expect(
      documentSections.find((s) => s.sectionId === "harvest-wait")?.text,
    ).toContain("10 × 24");
    expect(
      documentSections.find(
        (s) => s.sourceId === "doc-pesticide-b" && s.sectionId === "identity",
      )?.text,
    ).toContain("Gerçek ürün etiketi değildir");
  });
});
