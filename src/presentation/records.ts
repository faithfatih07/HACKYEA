import {
  ClipboardList,
  Link2,
  Package,
  Tractor,
  Users,
  Warehouse,
  MapPin,
  FileText,
} from "lucide-react";
import { t } from "../i18n";
import type { MessageKey } from "../i18n/messages";
import type { EntityReference, Impact } from "../domain/types";
import type { FarmView } from "../domain/selectors";
export function recordInfo(state: FarmView, ref: EntityReference) {
  const table = {
    task: {
      items: state.jobs,
      route: "jobs",
      label: t("job"),
      icon: ClipboardList,
    },
    asset: {
      items: state.machines,
      route: "machines",
      label: t("machines"),
      icon: Tractor,
    },
    person: {
      items: state.people,
      route: "team",
      label: t("team"),
      icon: Users,
    },
    inventoryBalance: {
      items: state.stocks,
      route: "inventory",
      label: t("stock"),
      icon: Package,
    },
    product: {
      items: state.domain.products,
      route: "products",
      label: t("productRecord"),
      icon: Package,
    },
    field: {
      items: state.fields,
      route: "fields",
      label: t("field"),
      icon: MapPin,
    },
    storageLocation: {
      items: state.warehouses,
      route: "warehouses",
      label: t("inventory"),
      icon: Warehouse,
    },
    serviceOffer: {
      items: state.domain.serviceOffers ?? [],
      route: "services",
      label: t("serviceOffer"),
      icon: FileText,
    },
    farm: {
      items: [state.domain.farm],
      route: "farm",
      label: t("myFarm"),
      icon: Warehouse,
    },
  };
  const group = table[ref.kind as keyof typeof table];
  const item = group?.items.find((i) => i.id === ref.id);
  return {
    name: item ? ("title" in item ? item.title : item.name) : ref.id,
    route: item
      ? group.route + (ref.kind === "farm" ? "" : "/" + ref.id)
      : null,
    label: group?.label ?? ref.kind,
    Icon: group?.icon ?? Link2,
  };
}

export function impactText(
  state: FarmView,
  impact: Impact,
  _language: "tr" | "en",
) {
  const values: Record<string, unknown> = {
    ...impact.values,
    unit:
      impact.values.unit ??
      state.domain.products.find((p) =>
        impact.evidenceRefs.some((r) => r.kind === "product" && r.id === p.id),
      )?.unit ??
      "kg",
  };
  for (const [key, value] of Object.entries(values))
    if (typeof value === "number")
      values[key] = new Intl.NumberFormat("en-GB", {
        maximumFractionDigits: 3,
      }).format(value);
  for (const [key, kind] of [
    ["task", "task"],
    ["parent", "task"],
    ["asset", "asset"],
    ["person", "person"],
    ["offer", "serviceOffer"],
  ] as const) {
    const id = impact.values[key + "Id"];
    if (typeof id === "string") {
      const info = recordInfo(state, { kind, id });
      if (info.route) values[key] = info.name;
    }
  }
  if (values.resources)
    values.resources = impact.evidenceRefs
      .filter((r) => r.kind === "asset" || r.kind === "person")
      .map((r) => recordInfo(state, r).name)
      .join(", ");
  return t(impact.messageKey as MessageKey, values);
}
