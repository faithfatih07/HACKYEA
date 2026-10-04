import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
import { createDemoState } from "../domain/demo";
import { documentSections } from "../ai/documents";
import {
  groundDocumentAnswer,
  localDocumentInterpretation,
} from "../ai/answers";
import {
  demoProductCodes,
  matchProductCode,
  productCatalog,
  selectCatalogProduct,
} from "./catalog";
import { productCodeReader } from "./decoder";

describe("read-only product code matching", () => {
  it.each(demoProductCodes)(
    "maps both QR and EAN-13 to $productId",
    (codes) => {
      const state = createDemoState();
      for (const code of [codes.qr, codes.ean13]) {
        const match = matchProductCode(code, state.products);
        expect(match.status).toBe("found");
        if (match.status === "found")
          expect(match.product.id).toBe(codes.productId);
      }
    },
  );
  it("manual entry trims surrounding whitespace and preserves leading zeroes", () => {
    const products = createDemoState().products;
    expect(matchProductCode("  2000000000015\n", products).status).toBe(
      "found",
    );
    expect(matchProductCode("0000000000000", products)).toEqual({
      status: "unknown",
      code: "0000000000000",
    });
  });
  it("unknown codes, URLs and product names do not create guessed products", () => {
    for (const code of [
      "https://example.com/product-fertilizer-a",
      "2000000000016",
      "Demo Gübre A",
      "NOT-REGISTERED",
    ]) {
      expect(matchProductCode(code, createDemoState().products)).toEqual({
        status: "unknown",
        code,
      });
    }
  });
  it("rejects empty, oversized and control-character input", () => {
    for (const code of ["  ", "x".repeat(513), "AGRUNIO:\u0000DEMO"])
      expect(matchProductCode(code, []).status).toBe("invalid");
  });
  it("allows explicit manual selection only from catalog IDs", () => {
    const products = createDemoState().products;
    expect(selectCatalogProduct("product-pesticide-b", products)?.name).toBe(
      "Demo İlaç B",
    );
    expect(selectCatalogProduct("Demo Gübre A", products)).toBeNull();
    expect(selectCatalogProduct("made-up-product", products)).toBeNull();
    expect(new Set(productCatalog(products).map((p) => p.id)).size).toBe(
      productCatalog(products).length,
    );
  });
  it("uses the current product record and never changes inventory or any farm state", () => {
    const state = createDemoState();
    state.products[0].name = "My updated demo product";
    const before = structuredClone(state);
    const match = matchProductCode(demoProductCodes[0].ean13, state.products);
    expect(match.status === "found" && match.product.name).toBe(
      "My updated demo product",
    );
    selectCatalogProduct("product-pesticide-b", state.products);
    expect(state).toEqual(before);
    expect(state.inventoryBalances[0].quantity).toBe(800);
    expect(
      state.inventoryBalances.some(
        (b) => b.productId === "product-pesticide-b",
      ),
    ).toBe(false);
  });
  it("a scanned product connects to verified source sections, not facts encoded in its code", () => {
    const match = matchProductCode(
      demoProductCodes[0].qr,
      createDemoState().products,
    );
    if (match.status !== "found") throw new Error("Expected fixture product");
    const id = match.product.id;
    const question = "Bir çuval kaç kilo?";
    const answer = groundDocumentAnswer(
      question,
      localDocumentInterpretation(question, id),
      id,
      null,
      "tr",
    );
    expect(answer.messageKey).toBe("answerPackaging");
    expect(answer.sections).toContainEqual(
      expect.objectContaining({
        sourceId: "doc-fertilizer-a",
        sectionId: "packaging",
        productId: id,
      }),
    );
    expect(
      documentSections.find((s) => s.sectionId === "packaging")?.text,
    ).toContain("50 kg");
    const dose = "Bu gübreyi dekara kaç kilo uygulamalıyım?";
    expect(
      groundDocumentAnswer(
        dose,
        localDocumentInterpretation(dose, id),
        id,
        null,
        "tr",
      ).unavailable,
    ).toBe(true);
  });
});

// Decode the actual generated SVG rectangles as pixels using the production
// ZXing engine. This tests the printable fixtures and both formats, not a camera.
function decodeSvg(path: string) {
  const svg = readFileSync(`public${path}`, "utf8");
  const bounds = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
  const width = Number(bounds[1]) * 4,
    height = Number(bounds[2]) * 4;
  const pixels = new Uint8ClampedArray(width * height).fill(255);
  for (const rect of svg.matchAll(
    /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g,
  )) {
    const [x, y, w, h] = rect.slice(1).map((v) => Number(v) * 4);
    for (let row = y; row < y + h; row++)
      pixels.fill(0, row * width + x, row * width + x + w);
  }
  const reader = productCodeReader();
  return reader.decode(
    new BinaryBitmap(
      new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)),
    ),
  );
}

describe("demo label files", () => {
  it.each(demoProductCodes)(
    "decodes the actual QR and EAN-13 SVG for $productId",
    (codes) => {
      const qr = decodeSvg(codes.qrImage),
        ean = decodeSvg(codes.barcodeImage);
      expect(qr.getText()).toBe(codes.qr);
      expect(qr.getBarcodeFormat()).toBe(BarcodeFormat.QR_CODE);
      expect(ean.getText()).toBe(codes.ean13);
      expect(ean.getBarcodeFormat()).toBe(BarcodeFormat.EAN_13);
    },
  );
});
