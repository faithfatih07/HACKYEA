import type { FarmState } from "./types";

// Historical seed text is intentionally retained ONLY as exact-match migration
// evidence. IDs scope every replacement. Custom names, free notes, failure
// reasons, quantities, schedules and operation/audit history are never rewritten.
// Only notes identical to a historical built-in seed description are eligible.
const seedAliases: [string, string, string, string, string[]][] = [
  [
    "farm",
    "murat-farm",
    "name",
    "Murat’s Farm",
    ["Murat’ın Çiftliği", "Murat'ın Çiftliği"],
  ],
  ["fields", "north", "name", "North", ["Kuzey"]],
  ["fields", "south", "name", "South", ["Güney"]],
  ["fields", "east", "name", "East", ["Doğu"]],
  ["fields", "north", "crop", "Wheat", ["Wheat", "Buğday"]],
  ["fields", "south", "crop", "Corn", ["Corn", "Mısır"]],
  ["fields", "east", "crop", "Barley", ["Barley", "Arpa"]],
  ["people", "murat", "role", "Farm owner", ["Farm owner", "Çiftlik sahibi"]],
  ["people", "ali", "role", "Farm worker", ["Farm worker", "Çiftlik çalışanı"]],
  [
    "people",
    "ece",
    "role",
    "Inventory keeper",
    ["Inventory keeper", "Stok sorumlusu"],
  ],
  [
    "assets",
    "tractor",
    "name",
    "Red tractor",
    ["Red tractor", "Kırmızı traktör"],
  ],
  [
    "assets",
    "tractor",
    "note",
    "Shared by the North and East fertilizing plans.",
    [
      "Shared by the Kuzey and Doğu fertilizing plans.",
      "Kuzey ve Doğu gübreleme planlarında ortak kullanılır.",
    ],
  ],
  [
    "assets",
    "spreader",
    "name",
    "Fertilizer spreader",
    ["Fertilizer spreader", "Gübre serpme makinesi"],
  ],
  [
    "assets",
    "spreader",
    "note",
    "Paired with the red tractor for fertilizing jobs.",
    [
      "Paired with the red tractor for fertilizing jobs.",
      "Gübreleme işlerinde kırmızı traktör ile kullanılır.",
    ],
  ],
  ["assets", "seeder", "name", "Seed drill", ["Seed drill", "Ekim makinesi"]],
  [
    "assets",
    "seeder",
    "note",
    "Assigned to the North sowing plan.",
    ["Assigned to the Kuzey sowing plan.", "Kuzey ekim planına atanmıştır."],
  ],
  ["assets", "trailer", "name", "Trailer", ["Trailer", "Römork"]],
  [
    "assets",
    "trailer",
    "note",
    "Available for a future job.",
    ["Available for a future job.", "Yeni bir işe atanabilir."],
  ],
  [
    "storageLocations",
    "main",
    "name",
    "Main warehouse",
    ["Main warehouse", "Ana depo"],
  ],
  [
    "storageLocations",
    "main",
    "description",
    "Main warehouse · Materials for field work",
    ["Ana depo · Materials for field work", "Tarla işleri için malzemeler"],
  ],
  [
    "storageLocations",
    "maintenance",
    "name",
    "Maintenance store",
    ["Maintenance store", "Bakım deposu"],
  ],
  [
    "storageLocations",
    "maintenance",
    "description",
    "Maintenance store · Tools and spare parts",
    ["Bakım deposu · Tools and spare parts", "Aletler ve yedek parçalar"],
  ],
  [
    "tasks",
    "north-fertilize",
    "title",
    "Fertilize North",
    ["Fertilize Kuzey", "Kuzey gübreleme"],
  ],
  ["tasks", "north-fertilize", "scheduleLabel", "Today", ["Bugün"]],
  [
    "tasks",
    "north-fertilize",
    "scheduleLabel",
    "After fertilizing",
    ["Gübrelemeden sonra", "After fertilizing"],
  ],
  [
    "tasks",
    "east-fertilize",
    "title",
    "Fertilize East",
    ["Fertilize Doğu", "Doğu gübreleme"],
  ],
  ["tasks", "east-fertilize", "scheduleLabel", "Today", ["Bugün"]],
  [
    "tasks",
    "east-fertilize",
    "scheduleLabel",
    "After fertilizing",
    ["Gübrelemeden sonra", "After fertilizing"],
  ],
  ["tasks", "north-sow", "title", "Sow North", ["Sow Kuzey", "Kuzey ekim"]],
  ["tasks", "north-sow", "scheduleLabel", "Today", ["Bugün"]],
  [
    "tasks",
    "north-sow",
    "scheduleLabel",
    "After fertilizing",
    ["Gübrelemeden sonra", "After fertilizing"],
  ],
  [
    "products",
    "product-fertilizer-a",
    "name",
    "Demo Fertilizer A",
    ["Demo Gübre A"],
  ],
  [
    "products",
    "product-pesticide-b",
    "name",
    "Demo Pesticide B",
    ["Demo İlaç B"],
  ],
  ["serviceOffers", "service-a", "name", "Demo Service A", ["Demo Hizmet A"]],
  ["serviceOffers", "service-b", "name", "Demo Service B", ["Demo Hizmet B"]],
  [
    "documentSources",
    "doc-fertilizer-a",
    "title",
    "Demo Fertilizer A Product Identity Card",
    ["Demo Gübre A Ürün Kimlik Kartı"],
  ],
  [
    "documentSources",
    "doc-pesticide-b",
    "title",
    "Demo Pesticide B Synthetic Test Label",
    ["Demo İlaç B Sentetik Test Etiketi"],
  ],
];

export function migrateDemoEnglish(state: FarmState): {
  state: FarmState;
  changed: boolean;
} {
  if (state.farm.id !== "murat-farm") return { state, changed: false };
  const copy = structuredClone(state);
  let changed = false;
  for (const [collection, id, property, english, aliases] of seedAliases) {
    const records =
      collection === "farm"
        ? [copy.farm]
        : ((copy as unknown as Record<string, unknown[]>)[collection] ?? []);
    const record = records.find(
      (item) => (item as { id: string }).id === id,
    ) as Record<string, unknown> | undefined;
    if (
      record &&
      typeof record[property] === "string" &&
      aliases.includes(record[property] as string) &&
      record[property] !== english
    ) {
      record[property] = english;
      changed = true;
    }
  }
  return { state: changed ? copy : state, changed };
}
