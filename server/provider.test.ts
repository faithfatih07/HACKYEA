import { describe, expect, it, vi } from "vitest";
const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(async () => ({ text: "{}" })),
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
import { GeminiProvider } from "./provider";
import { retrieveSections } from "../src/ai/documents";

describe("official SDK adapter without network", () => {
  it("uses the required model, JSON schema, system instructions and only retrieved sections", async () => {
    const provider = new GeminiProvider("mock-server-secret");
    const text = "Demo Gübre A’dan bir çuval kaç kilo?";
    const request = {
      text,
      language: "tr" as const,
      mode: "DOCUMENT_ANSWER" as const,
      context: null,
      productId: "product-fertilizer-a",
      applicationDateTime: null,
    };
    await provider.generate({
      request,
      sections: retrieveSections(text),
      today: "2026-10-04",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const sent = generateContent.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(sent[0].model).toBe("gemini-3.1-flash-lite");
    expect(sent[0].config).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0,
    });
    expect(JSON.stringify(sent[0])).not.toContain("mock-server-secret");
    expect(JSON.stringify(sent[0])).toContain("UNTRUSTED DATA");
    expect(JSON.stringify(sent[0])).toContain("packaging");
  });
});
