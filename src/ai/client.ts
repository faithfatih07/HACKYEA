import { apiResultSchema, selectAIContext } from "./schema";
import type { APIResult, AIRequest } from "./schema";
import type { FarmState } from "../domain/types";
import type { Language } from "../i18n/messages";
import { isDocumentQuestion } from "./documents";

export async function requestInterpretation(
  text: string,
  state: FarmState,
  language: Language,
  options?: { productId: string | null; applicationDateTime?: string | null },
): Promise<APIResult> {
  try {
    const documentOnly = Boolean(options) || isDocumentQuestion(text);
    const body: AIRequest = {
      text,
      language,
      mode: documentOnly ? "DOCUMENT_ANSWER" : "AUTO",
      productId: options?.productId ?? null,
      applicationDateTime: options?.applicationDateTime ?? null,
      context: documentOnly ? null : selectAIContext(state),
    };
    const response = await fetch("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { provider: "demo", reason: "unavailable" };
    const value = apiResultSchema.parse(await response.json());
    if (
      documentOnly &&
      value.provider === "gemini" &&
      value.result.mode !== "DOCUMENT_ANSWER"
    )
      return { provider: "demo", reason: "invalid_output" };
    return value;
  } catch {
    return { provider: "demo", reason: "unavailable" };
  }
}
