import {
  ArrowUpRight,
  ClipboardList,
  HelpCircle,
  Link2,
  Package,
  Tractor,
  Users,
  Warehouse,
  MapPin,
  FileText,
} from "lucide-react";
import { t, useLanguage } from "../i18n";
import { localizeMessage } from "../i18n/messages";
import type { MessageKey } from "../i18n/messages";
import { draftSource } from "../domain/impacts";
import type { ActionDraft, EntityReference, Impact } from "../domain/types";
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
  language: "tr" | "en",
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
      values[key] = new Intl.NumberFormat(
        language === "tr" ? "tr-TR" : "en-GB",
        { maximumFractionDigits: 3 },
      ).format(value);
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

// Records drive both the nodes and edges. There are no scenario-specific positions or results.
export function DecisionImpacts({
  state,
  impacts,
  go,
  draft,
  expanded = true,
  sourceLabel,
}: {
  state: FarmView;
  impacts: Impact[];
  go: (route: string) => void;
  draft?: ActionDraft;
  expanded?: boolean;
  sourceLabel?: string;
}) {
  const language = useLanguage();
  const source = draft
    ? draftSource(state.domain, draft)
    : impacts[0]
      ? { kind: impacts[0].sourceEntityType, id: impacts[0].sourceEntityId }
      : { kind: "farm" as const, id: state.domain.farm.id };
  const infoFor = (ref: EntityReference) => {
    const info = recordInfo(state, ref);
    return draft?.kind === "createTask" &&
      ref.kind === "task" &&
      ref.id === draft.task.id
      ? { ...info, name: draft.task.title, route: null }
      : info;
  };
  const start = infoFor(source);
  const groups = [1, 2].map((level) => ({
    level,
    items: impacts.filter((i) => Math.min(i.level, 2) === level),
  }));
  const labels = {
    confirmed: "impactConfirmed",
    warning: "impactWarning",
    unknown: "impactUnknown",
  } as const;
  return (
    <section className="decision-impacts" aria-label={t("decisionImpacts")}>
      <h3>
        <Link2 size={20} />
        {t("decisionImpacts")}
      </h3>
      <div className="decision-source">
        <start.Icon size={22} />
        <div>
          <small>{sourceLabel ?? t("sourceChange")}</small>
          <strong>{start.name || t("sourceChange")}</strong>
        </div>
      </div>
      {!impacts.length && <p>{t("noEffects")}</p>}
      {groups
        .filter((g) => g.items.length)
        .map((group) => (
          <div className="decision-level" key={group.level}>
            <h4>{t(group.level === 1 ? "directEffects" : "linkedEffects")}</h4>
            {group.items.map((impact, index) => {
              const affected = infoFor({
                kind: impact.affectedEntityType,
                id: impact.affectedEntityId,
              });
              const from = infoFor({
                kind: impact.sourceEntityType,
                id: impact.sourceEntityId,
              });
              return (
                <details
                  key={impact.id}
                  className={`decision-node ${impact.severity} ${impact.certainty}`}
                  style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }}
                  data-impact-level={impact.level}
                  open={
                    (expanded && impact.kind === "repairUnknown") || undefined
                  }
                >
                  <summary>
                    <span className="decision-icon">
                      <affected.Icon size={21} />
                    </span>
                    <span className="decision-node-title">
                      <small>{affected.label}</small>
                      <strong>{affected.name}</strong>
                      <span className="decision-certainty">
                        {t(labels[impact.certainty])} ·{" "}
                        {t(
                          impact.severity === "blocked"
                            ? "blockedResource"
                            : impact.severity === "attention"
                              ? "attentionRequired"
                              : "informationOnly",
                        )}
                      </span>
                      <span className="decision-summary-reason">
                        {impactText(state, impact, language)}
                      </span>
                    </span>
                    <HelpCircle size={19} aria-label={t("whyAffected")} />
                  </summary>
                  <div className="decision-evidence">
                    <h5>{t("whyAffected")}</h5>
                    <p className="decision-edge">
                      {from.name} → {affected.name}
                    </p>
                    {impact.suggestedQuestion && (
                      <p className="decision-question">
                        {localizeMessage(impact.suggestedQuestion, language)}
                      </p>
                    )}
                    <h5>{t("evidenceRecords")}</h5>
                    <div className="decision-evidence-links">
                      {impact.evidenceRefs.map((ref) => {
                        const info = infoFor(ref);
                        return info.route ? (
                          <button
                            type="button"
                            className="resource-link"
                            key={ref.kind + ref.id}
                            onClick={() => go(info.route!)}
                          >
                            <info.Icon size={16} />
                            <span>
                              {info.name}
                              <small>{ref.id}</small>
                            </span>
                            <ArrowUpRight size={16} />
                          </button>
                        ) : (
                          <span key={ref.kind + ref.id}>
                            {info.name} ({ref.id})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ))}
    </section>
  );
}
