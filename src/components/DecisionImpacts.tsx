import { ArrowUpRight, HelpCircle, Link2 } from "lucide-react";
import { recordInfo, impactText } from "../presentation/records";
export { recordInfo, impactText } from "../presentation/records";
import { ImpactStory } from "./ImpactStory";
import { t, useLanguage } from "../i18n";
import { localizeMessage } from "../i18n/messages";
import { draftSource } from "../domain/impacts";
import type { ActionDraft, EntityReference, Impact } from "../domain/types";
import type { FarmView } from "../domain/selectors";

// Records drive both the nodes and edges. There are no scenario-specific positions or results.
export function DecisionImpacts({
  state,
  impacts,
  go,
  draft,
  expanded = true,
  sourceLabel,
  valid = true,
}: {
  state: FarmView;
  impacts: Impact[];
  go: (route: string) => void;
  draft?: ActionDraft;
  expanded?: boolean;
  sourceLabel?: string;
  valid?: boolean;
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
      {draft && !sourceLabel && (
        <ImpactStory
          state={state}
          draft={draft}
          impacts={impacts}
          valid={valid}
          go={go}
        />
      )}
      <details
        className="story-detail-list"
        open={!draft || Boolean(sourceLabel)}
      >
        <summary>{t("storyDetailed")}</summary>
        <small className="pill">{t("recordsCalculated")}</small>
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
              <h4>
                {t(group.level === 1 ? "directEffects" : "linkedEffects")}
              </h4>
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
      </details>
    </section>
  );
}
