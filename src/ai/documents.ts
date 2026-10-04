import type { Product } from "../domain/types";

export type DocumentSection = {
  sourceId: string;
  productId: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  documentType: "productIdentity" | "syntheticTestLabel";
  isSyntheticDemo: true;
};
// Read-only, reviewed fixture catalog. This is not an uploaded real product label.
// Facts are encoded separately: a model cannot invent a conversion or waiting period.
export const documentProducts: Product[] = [
  {
    id: "product-fertilizer-a",
    farmId: "murat-farm",
    name: "Demo Gübre A",
    kind: "fertilizer",
    unit: "kg",
    documentSourceIds: ["doc-fertilizer-a"],
  },
  {
    id: "product-pesticide-b",
    farmId: "murat-farm",
    name: "Demo İlaç B",
    kind: "pesticide",
    unit: "l",
    documentSourceIds: ["doc-pesticide-b"],
  },
];
export const documentSections: DocumentSection[] = [
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Gübre A Ürün Kimlik Kartı",
    sectionId: "identity",
    sectionTitle: "Ürün kimliği",
    text: "Hayalî demo üründür. Gerçek ürünün bileşimi kayıtlı değildir.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Gübre A Ürün Kimlik Kartı",
    sectionId: "packaging",
    sectionTitle: "Ambalaj",
    text: "Ambalaj büyüklüğü: bir çuval 50 kg'dır.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-fertilizer-a",
    productId: "product-fertilizer-a",
    title: "Demo Gübre A Ürün Kimlik Kartı",
    sectionId: "unrecorded",
    sectionTitle: "Kayıtlı olmayan bilgiler",
    text: "Uygulama dozu kayıtlı değildir. Uygulama yöntemi kayıtlı değildir. Ürünün gerçek bileşimi kayıtlı değildir.",
    documentType: "productIdentity",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-pesticide-b",
    productId: "product-pesticide-b",
    title: "Demo İlaç B Sentetik Test Etiketi",
    sectionId: "identity",
    sectionTitle: "Sentetik test belgesi",
    text: "Gerçek ürün etiketi değildir, yalnızca hackathon testi içindir. Hayalî Demo İlaç B ürünü içindir. Aktif madde, ruhsat, doz, karışım, KKD ve yeniden giriş süresi kayıtlı değildir.",
    documentType: "syntheticTestLabel",
    isSyntheticDemo: true,
  },
  {
    sourceId: "doc-pesticide-b",
    productId: "product-pesticide-b",
    title: "Demo İlaç B Sentetik Test Etiketi",
    sectionId: "harvest-wait",
    sectionTitle: "Sentetik bekleme süresi",
    text: "Yalnızca hayalî Demo İlaç B için sentetik test bilgisi: hasat öncesi bekleme süresi 10 × 24 saattir. Uygulama tarihi ve saati olmadan hasat zamanı hesaplanamaz. Gerçek ürün tavsiyesi değildir.",
    documentType: "syntheticTestLabel",
    isSyntheticDemo: true,
  },
];
export const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
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
