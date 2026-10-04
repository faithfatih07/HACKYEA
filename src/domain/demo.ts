import { domainMessage } from "../i18n/messages";
import type { FarmState } from "./types";

export function createDemoState(): FarmState {
  return {
    version: 1,
    revision: 0,
    fields: [
      {
        id: "north",
        name: "Kuzey",
        area: 30,
        crop: domainMessage("cropWheat"),
        stage: "Planned",
        color: "wheat",
      },
      {
        id: "south",
        name: "Güney",
        area: 35,
        crop: domainMessage("cropCorn"),
        stage: "Growing",
        color: "corn",
      },
      {
        id: "east",
        name: "Doğu",
        area: 25,
        crop: domainMessage("cropBarley"),
        stage: "Planned",
        color: "barley",
      },
    ],
    people: [
      {
        id: "murat",
        name: "Murat Demir",
        role: domainMessage("farmOwner"),
        initials: "MD",
        color: "green",
      },
      {
        id: "ali",
        name: "Ali Kaya",
        role: domainMessage("roleWorker"),
        initials: "AK",
        color: "yellow",
      },
      {
        id: "ece",
        name: "Ece Demir",
        role: domainMessage("roleInventory"),
        initials: "ED",
        color: "pink",
      },
    ],
    machines: [
      {
        id: "tractor",
        name: domainMessage("redTractor"),
        kind: "tractor",
        note: domainMessage("machineTractorNote"),
      },
      {
        id: "spreader",
        name: domainMessage("fertilizerSpreader"),
        kind: "spreader",
        note: domainMessage("machineSpreaderNote"),
      },
      {
        id: "seeder",
        name: domainMessage("seedDrill"),
        kind: "seeder",
        note: domainMessage("machineSeederNote"),
      },
      {
        id: "trailer",
        name: domainMessage("trailer"),
        kind: "trailer",
        note: domainMessage("machineTrailerNote"),
      },
    ],
    warehouses: [
      {
        id: "main",
        name: domainMessage("mainWarehouse"),
        description: domainMessage("mainWarehouseDescription"),
        personId: "ece",
      },
      {
        id: "maintenance",
        name: domainMessage("maintenanceWarehouse"),
        description: domainMessage("maintenanceWarehouseDescription"),
        personId: "murat",
      },
    ],
    stocks: [
      {
        id: "fertilizer-a",
        name: "Demo Gübre A",
        warehouseId: "main",
        quantity: 800,
        unit: "kg",
      },
    ],
    jobs: [
      {
        id: "north-fertilize",
        title: domainMessage("northFertilize"),
        fieldId: "north",
        personId: "ali",
        machineIds: ["tractor", "spreader"],
        stockId: "fertilizer-a",
        plannedQuantity: 600,
        type: "fertilizing",
        status: "planned",
        scheduled: "Today",
      },
      {
        id: "east-fertilize",
        title: domainMessage("eastFertilize"),
        fieldId: "east",
        personId: "ali",
        machineIds: ["tractor", "spreader"],
        stockId: "fertilizer-a",
        plannedQuantity: 300,
        type: "fertilizing",
        status: "planned",
        scheduled: "Today",
      },
      {
        id: "north-sow",
        title: domainMessage("northSow"),
        fieldId: "north",
        personId: "ali",
        machineIds: ["tractor", "seeder"],
        plannedQuantity: 0,
        type: "sowing",
        status: "planned",
        dependencyId: "north-fertilize",
        scheduled: domainMessage("afterFertilizing"),
      },
    ],
    consumptions: [],
  };
}
