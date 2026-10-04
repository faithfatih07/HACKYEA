import { afterEach, describe, expect, it, vi } from "vitest";
import { requestLabelExtraction, requestUploadedAnswer } from "./client";
import { splitSourceText } from "./documents";
const extraction = {
  productName: "Test Fertilizer",
  manufacturer: null,
  category: "fertilizer",
  packageQuantity: 50,
  packageUnit: "kg",
  barcode: null,
  batch: null,
  expiryDate: null,
  readability: "readable",
  sourceLanguage: "English",
  sourceText: "Test Fertilizer, 50 kg",
  evidence: [
    { field: "productName", quote: "Test Fertilizer" },
    { field: "category", quote: "Test Fertilizer" },
    { field: "packageQuantity", quote: "50 kg" },
    { field: "packageUnit", quote: "50 kg" },
  ],
};
const file = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "label.png", {
    type: "image/png",
  });
const mockResponse = (body: unknown, status = 200) => {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
};
afterEach(() => vi.unstubAllGlobals());
describe("upload client error and read-only boundaries", () => {
  it("validates evidence on a real-provider-labelled response without confirming anything", async () => {
    const fetch = mockResponse({ provider: "gemini", extraction });
    expect(await requestLabelExtraction(file())).toEqual(extraction);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toHaveLength(2);
  });
  it("rejects no-key extraction and offers honest manual entry", async () => {
    mockResponse({ error: "no_key" });
    await expect(requestLabelExtraction(file())).rejects.toThrow(/manually/);
  });
  it("API failures show a safe error, not provider details or fake extraction", async () => {
    mockResponse({ error: "sensitive-provider-value" });
    await expect(requestLabelExtraction(file())).rejects.toThrow(
      "AI extraction failed",
    );
    mockResponse({}, 413);
    await expect(requestLabelExtraction(file())).rejects.toThrow(/10 MB/);
  });
  it("unknown format is rejected before contacting the API", async () => {
    const fetch = mockResponse({});
    await expect(
      requestLabelExtraction(
        new File(["GIF89a"], "label.gif", { type: "image/gif" }),
      ),
    ).rejects.toThrow(/Supported files/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects fabricated extraction fields even when labelled Gemini", async () => {
    mockResponse({
      provider: "gemini",
      extraction: { ...extraction, barcode: "invented" },
    });
    await expect(requestLabelExtraction(file())).rejects.toThrow(/evidence/);
  });
  it("uploaded Q&A never substitutes the synthetic fallback on API failure", async () => {
    mockResponse({ error: "no_key" });
    const sections = splitSourceText(
      "50 kg",
      "s",
      "p",
      "Label",
      "f",
      false,
      "English",
    );
    await expect(
      requestUploadedAnswer("Package weight?", "p", sections),
    ).rejects.toThrow(/not configured/);
    mockResponse({ provider: "gemini", answer: { found: false, claims: [] } });
    expect(await requestUploadedAnswer("Dose?", "p", sections)).toEqual({
      found: false,
      claims: [],
    });
  });
});
