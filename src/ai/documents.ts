import type { Product } from "../domain/types";

export type DocumentSection = {
  sourceId: string;
  productId: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  documentType: "productIdentity" | "syntheticTestLabel" | "uploadedLabel" | "uploadedPDF";
  isSyntheticDemo: boolean;
  sourceLanguage?: string | null;
  fileId?: string;
  pageNumber?: number | null;
};
// Read-only, reviewed fixture catalog. This is not an uploaded real product label.
// Facts are encoded separately: a model cannot invent a conversion or waiting period.
export const documentProducts: Product[] = [
  {
    id: "product-fertilizer-a",
    farmId: "murat-farm",
    name: "Demo Fertilizer A",
    kind: "fertilizer",
    unit: "kg",
    documentSourceIds: ["doc-fertilizer-a"],
  },
  {
    id: "product-pesticide-b",
    farmId: "murat-farm",
    name: "Demo Pesticide B",
    kind: "pesticide",
    unit: "l",
    documentSourceIds: ["doc-pesticide-b"],
  },
];
export const documentSections: DocumentSection[] = [
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Fertilizer A Product Identity Card",
    sectionId: "identity",
    sectionTitle: "Product identity",
    text: "This is a fictional demo product. Its actual composition is not recorded.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Fertilizer A Product Identity Card",
    sectionId: "packaging",
    sectionTitle: "Packaging",
    text: "Packaging size: one bag contains 50 kg.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Fertilizer A Product Identity Card",
    sectionId: "unrecorded",
    sectionTitle: "Unrecorded information",
    text: "The application dose is not recorded. The application method is not recorded. The actual product composition is not recorded.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-pesticide-b",
    productId: "product-pesticide-b",
    title: "Demo Pesticide B Synthetic Test Label",
    sectionId: "identity",
    sectionTitle: "Synthetic test document",
    text: "This is not a real product label; it is only for hackathon testing of fictional Demo Pesticide B. Active ingredient, registration, dose, mixing, PPE and re-entry time are not recorded.",
    documentType: "syntheticTestLabel",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-pesticide-b",
    productId: "product-pesticide-b",
    title: "Demo Pesticide B Synthetic Test Label",
    sectionId: "harvest-wait",
    sectionTitle: "Synthetic waiting period",
    text: "Synthetic test information for fictional Demo Pesticide B only: the pre-harvest waiting period is 10 × 24 hours. Harvest time cannot be calculated without an application date and time. This is not advice for real products.",
    documentType: "syntheticTestLabel",
    isSyntheticDemo: true,
  },
];
export const normalize = (value: string) =>
  value
    .toLocaleLowerCase("en-GB")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export function isDocumentQuestion(text: string) {
  return /\?|kac|nasil|ne zaman|how|when|doz|dose|dekara|bekleme/.test(
    normalize(text),
  );
}
export function documentTopic(question: string) {
  const q = normalize(question);
  if (
    /doz|dekara|dekar|uygula|uygulama yontem|dose|per acre|per hectare|application rate|apply/.test(
      q,
    ) &&
    !/hasat|harvest/.test(q)
  )
    return "unavailable";
  if (/cuval|ambalaj|bag|packag/.test(q)) return "packaging";
  if (/hasat|bekleme|harvest|waiting/.test(q)) return "harvestWait";
  return "unavailable";
}
export function retrieveSections(
  question: string,
  productId?: string | null,
): DocumentSection[] {
  const q = normalize(question);
  const resolved =
    productId ??
    (/demo ilac b|demo pesticide b/.test(q)
      ? "product-pesticide-b"
      : /gubre|fertilizer/.test(q)
        ? "product-fertilizer-a"
        : null);
  if (!resolved) return [];
  const topic = documentTopic(question);
  const relevant =
    topic === "packaging"
      ? "packaging"
      : topic === "harvestWait"
        ? "harvest-wait"
        : "unrecorded";
  return documentSections.filter(
    (s) =>
      s.productId === resolved &&
      (s.sectionId === relevant || s.sectionId === "identity"),
  );
}
export function verifiedBagKg(
  productId: string | null,
  sections = documentSections,
): number | null {
  return sections.some(
    (s) =>
      s.productId === productId &&
      s.sourceId === "doc-fertilizer-a" &&
      s.sectionId === "packaging" &&
      s.text === documentSections[1].text,
  )
    ? 50
    : null;
}
