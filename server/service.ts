import { parseModelResult, requestSchema } from "../src/ai/schema";
import type { APIResult } from "../src/ai/schema";
import { retrieveSections } from "../src/ai/documents";
import { groundDocumentAnswer } from "../src/ai/answers";
import type { AIProvider } from "./provider";

// Dependency injection keeps tests offline. This service has no domain writer.
export async function interpretRequest(
  input: unknown,
  provider: AIProvider | null,
  today = new Date().toLocaleDateString("en-CA"),
): Promise<APIResult> {
  const request = requestSchema.parse(input);
  if (!provider) return { provider: "demo", reason: "no_key" };
  const sections = retrieveSections(request.text, request.productId);
  let raw: unknown;
  try {
    raw = await provider.generate({ request, sections, today });
  } catch {
    return { provider: "demo", reason: "unavailable" };
  }
  try {
    const result = parseModelResult(raw);
    if (request.mode === "DOCUMENT_ANSWER" && result.mode !== "DOCUMENT_ANSWER")
      throw new Error("Wrong mode");
    if (result.mode === "DOCUMENT_ANSWER")
      groundDocumentAnswer(
        request.text,
        result,
        request.productId,
        request.applicationDateTime,
        request.language,
      );
    else {
      if (!request.context) throw new Error("No context");
      const refs = result.targetEntityIds;
      const collections = {
        taskId: request.context.tasks,
        fieldId: request.context.fields,
        personId: request.context.people,
        assetId: request.context.assets,
        productId: request.context.products,
        inventoryBalanceId: request.context.inventoryBalances,
      };
      for (const key of Object.keys(
        collections,
      ) as (keyof typeof collections)[])
        if (refs[key] && !collections[key].some((r) => r.id === refs[key]))
          throw new Error("Unknown ID");
    }
    return { provider: "gemini", result };
  } catch {
    return { provider: "demo", reason: "invalid_output" };
  }
}
