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
    const text = "How many kilograms are in one bag of Demo Fertilizer A?";
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
    expect(JSON.stringify(sent[0])).toContain(
      "Always write summaries and questions in English",
    );
    expect(JSON.stringify(sent[0])).toContain("Demo Fertilizer A");
  });
});

describe("uploaded media SDK calls", () => {
  it.each(["image/png", "application/pdf"])(
    "sends %s inline data with strict extraction JSON and no secret",
    async (mimeType) => {
      generateContent.mockClear();
      await new GeminiProvider("mock-server-secret").extractLabel({
        mimeType,
        data: "mock-base64",
      });
      const sent = generateContent.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(sent[0]).toMatchObject({
        model: "gemini-3.1-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              { text: expect.any(String) },
              { inlineData: { mimeType, data: "mock-base64" } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: expect.any(Object),
        },
      });
      expect(JSON.stringify(sent)).toContain("UNTRUSTED DATA");
      expect(JSON.stringify(sent)).toContain("never owned inventory");
      expect(JSON.stringify(sent)).not.toContain("mock-server-secret");
    },
  );
  it("restricts uploaded answers to untrusted sections, exact quotes and no calculations", async () => {
    generateContent.mockClear();
    await new GeminiProvider("mock-server-secret").answerUploadedDocument({
      question: "Package weight?",
      sections: [],
    });
    const text = JSON.stringify(generateContent.mock.calls[0]);
    expect(text).toContain("English ONLY");
    expect(text).toContain("UNTRUSTED DATA");
    expect(text).toContain("EXACT verbatim quote");
    expect(text).toContain("No external knowledge");
    expect(text).not.toContain("mock-server-secret");
  });
});
