import { describe, expect, it, vi } from "vitest";
import { extractLabel, answerUploadedDocument } from "./uploads";
import type { DocumentAIProvider } from "./uploads";
import { splitSourceText } from "../src/uploads/documents";
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const raw = {
  productName: "Test Fertilizer",
  manufacturer: null,
  category: "fertilizer",
  packageQuantity: 50,
  packageUnit: "kg",
  barcode: null,
  batch: null,
  expiryDate: null,
  sourceText: "Test Fertilizer\nNet 50 kg",
  sourceLanguage: "English",
  readability: "readable",
  evidence: [
    { field: "productName", quote: "Test Fertilizer" },
    { field: "category", quote: "Test Fertilizer" },
    { field: "packageQuantity", quote: "Net 50 kg" },
    { field: "packageUnit", quote: "Net 50 kg" },
  ],
};
const provider = (
  extraction: unknown = raw,
  answer: unknown = { found: false, claims: [] },
): DocumentAIProvider => ({
  extractLabel: vi.fn(async () => extraction),
  answerUploadedDocument: vi.fn(async () => answer),
});
const request = () => ({
  question: "What is the dose?",
  productId: "p",
  sections: splitSourceText(
    "Net 50 kg",
    "s",
    "p",
    "Label",
    "f",
    false,
    "English",
  ),
});
describe("real-upload API boundaries with mock provider, no network", () => {
  it("returns a strictly validated extraction draft, never a stock change", async () => {
    const mock = provider();
    expect(await extractLabel(bytes, "image/png", mock)).toMatchObject({
      provider: "gemini",
      extraction: { packageQuantity: 50 },
    });
    expect(mock.extractLabel).toHaveBeenCalledWith({
      mimeType: "image/png",
      data: Buffer.from(bytes).toString("base64"),
    });
  });
  it("invalid JSON and unsupported fields fail extraction, not fabricated success", async () => {
    expect(await extractLabel(bytes, "image/png", provider("broken"))).toEqual({
      error: "extraction_failed",
    });
    expect(
      await extractLabel(
        bytes,
        "image/png",
        provider({ ...raw, ownedStock: 50 }),
      ),
    ).toEqual({ error: "extraction_failed" });
  });
  it("missing key offers manual entry; API errors expose no secrets", async () => {
    expect(await extractLabel(bytes, "image/png", null)).toEqual({
      error: "no_key",
    });
    const mock = provider();
    mock.extractLabel = async () => {
      throw new Error("sensitive-provider-error");
    };
    expect(await extractLabel(bytes, "image/png", mock)).toEqual({
      error: "extraction_failed",
    });
    expect(await answerUploadedDocument(request(), null)).toEqual({
      error: "no_key",
    });
  });
  it("unreadable images remain unreadable/unknown", async () => {
    const unreadable = {
      ...raw,
      readability: "unreadable",
      productName: null,
      category: "unknown",
      packageQuantity: null,
      packageUnit: "unknown",
      sourceText: "",
      evidence: [],
    };
    expect(
      await extractLabel(bytes, "image/png", provider(unreadable)),
    ).toMatchObject({
      provider: "gemini",
      extraction: { readability: "unreadable", packageQuantity: null },
    });
  });
  it("invalid file bytes never call the AI provider", async () => {
    const mock = provider();
    await expect(
      extractLabel(bytes, "application/pdf", mock),
    ).rejects.toThrow();
    expect(mock.extractLabel).not.toHaveBeenCalled();
  });
  it("missing dose is explicitly not found and references are validated", async () => {
    expect(await answerUploadedDocument(request(), provider())).toEqual({
      provider: "gemini",
      answer: { found: false, claims: [] },
    });
    const invalid = {
      found: true,
      claims: [
        {
          answer: "Use 600 kg",
          sourceId: "s",
          sectionId: "section-1",
          quote: "Net 50 kg",
          translation: false,
        },
      ],
    };
    expect(
      await answerUploadedDocument(request(), provider(raw, invalid)),
    ).toEqual({ error: "answer_failed" });
  });
  it("rejects wrong-product sources and invented page references before AI", async () => {
    const mock = provider(),
      r = request();
    r.sections[0].productId = "other";
    await expect(answerUploadedDocument(r, mock)).rejects.toThrow();
    expect(mock.answerUploadedDocument).not.toHaveBeenCalled();
    await expect(
      answerUploadedDocument(
        {
          ...request(),
          sections: [{ ...request().sections[0], pageNumber: 1 }],
        },
        mock,
      ),
    ).rejects.toThrow();
  });
});
