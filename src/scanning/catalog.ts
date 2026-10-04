import type { Product } from "../domain/types";
import { documentProducts } from "../ai/documents";

// Opaque demo identifiers, never product facts or URLs. EANs are fictional,
// valid-checksum test codes, not registered retail identifiers.
export const demoProductCodes = [
  {
    productId: "product-fertilizer-a",
    qr: "AGRUNIO:DEMO:FERTILIZER-A",
    ean13: "2000000000015",
    qrImage: "/demo/fertilizer-a-qr.svg",
    barcodeImage: "/demo/fertilizer-a-ean.svg",
  },
  {
    productId: "product-pesticide-b",
    qr: "AGRUNIO:DEMO:PESTICIDE-B",
    ean13: "2000000000022",
    qrImage: "/demo/pesticide-b-qr.svg",
    barcodeImage: "/demo/pesticide-b-ean.svg",
  },
] as const;

export function productCatalog(products: readonly Product[]): Product[] {
  const catalog = new Map(products.map((product) => [product.id, product]));
  // Existing read-only synthetic document products are selectable even when
  // there is no inventory record. This does not create a balance of zero.
  for (const product of documentProducts)
    if (!catalog.has(product.id)) catalog.set(product.id, product);
  return [...catalog.values()];
}

export function selectCatalogProduct(
  productId: string,
  products: readonly Product[],
): Product | null {
  return productCatalog(products).find((p) => p.id === productId) ?? null;
}

export type CodeMatch =
  | { status: "found"; code: string; product: Product }
  | { status: "unknown"; code: string }
  | { status: "invalid"; code: string };

// Shared by camera and manual entry. No fetch, navigation, AI, or store access.
export function matchProductCode(
  input: string,
  products: readonly Product[],
): CodeMatch {
  const code = input.trim();
  if (!code || code.length > 512 || /[\u0000-\u001f\u007f]/.test(code))
    return { status: "invalid", code };
  const known = products.find(
    (p) => p.barcode === code || p.codes?.includes(code),
  );
  if (known) return { status: "found", code, product: known };
  const entry = demoProductCodes.find((p) => p.qr === code || p.ean13 === code);
  const product = entry
    ? selectCatalogProduct(entry.productId, products)
    : null;
  return product
    ? { status: "found", code, product }
    : { status: "unknown", code };
}
