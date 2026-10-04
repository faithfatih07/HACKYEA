import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  TriangleAlert,
  Wrench,
  Warehouse,
  ArrowDown,
  CalendarClock,
  Tractor,
  Sprout,
  Truck,
  UserRound,
  Package,
  MapPin,
} from "lucide-react";
import { t, useLanguage, localizeFarm } from "../i18n";
import type { FarmView } from "../domain/selectors";
import type {
  ActionDraft,
  EntityReference,
  FarmState,
  Impact,
  Schedule,
} from "../domain/types";
import { buildImpactScene } from "../presentation/impactScene";
import { recordInfo, impactText } from "../presentation/records";

function Glyph({
  state,
  entity,
}: {
  state: FarmView;
  entity: EntityReference;
}) {
  const asset =
    entity.kind === "asset"
      ? state.domain.assets.find((a) => a.id === entity.id)
      : null;
  const Icon =
    entity.kind === "person"
      ? UserRound
      : entity.kind === "field"
        ? MapPin
        : entity.kind === "storageLocation" ||
            entity.kind === "inventoryBalance"
          ? Warehouse
          : entity.kind === "product"
            ? Package
            : asset?.kind === "tractor"
              ? Tractor
              : asset?.kind === "trailer"
                ? Truck
                : asset
                  ? Sprout
                  : recordInfo(state, entity).Icon;
  return (
    <span className={`story-glyph ${entity.kind}`}>
      <Icon size={30} strokeWidth={1.6} />
    </span>
  );
}

const relationKey = (impact: Impact) =>
  impact.kind === "materialCoverage"
    ? "storyNeeded"
    : impact.kind === "resourceConflict"
      ? "storySameTime"
      : impact.kind === "scheduleUnknown"
        ? "storyTimeUnknown"
        : impact.kind === "dependentSchedule" || impact.kind === "dependency"
          ? "storyDepends"
          : "storyResourceLink";

export function ImpactStory({
  state,
  draft,
  impacts,
  go,
  valid = true,
  committed,
}: {
  state: FarmView;
  draft: ActionDraft;
  impacts: Impact[];
  go: (route: string) => void;
  valid?: boolean;
  committed?: FarmState;
}) {
  const language = useLanguage();
  const [play, setPlay] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const scene = buildImpactScene(state.domain, draft, impacts, valid);
  const display = committed ? localizeFarm(committed, language) : state;
  const mode = committed ? "saved" : "preview";
  const source = recordInfo(state, scene.source);
  const amount = (value: unknown, unit: string) =>
    typeof value === "number"
      ? `${new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 3 }).format(value)} ${unit}`
      : t("unknownStatus");
  function node(ref: EntityReference, compact = false) {
    const info = recordInfo(display, ref);
    const name =
      draft.kind === "createTask" && ref.id === draft.task.id
        ? draft.task.title
        : info.name;
    const person =
      ref.kind === "person"
        ? display.domain.people.find((p) => p.id === ref.id)
        : null;
    const contents = (
      <>
        <Glyph state={display} entity={ref} />
        <span>
          <small>{info.label}</small>
          <strong>{name}</strong>
          {person && (
            <small>
              {t("storyRecordedStatus")}:{" "}
              {t(
                person.availability === "available"
                  ? "availablePerson"
                  : person.availability === "unavailable"
                    ? "unavailablePerson"
                    : "unknownStatus",
              )}
            </small>
          )}
        </span>
      </>
    );
    return info.route ? (
      <button
        type="button"
        className={`story-record ${compact ? "compact" : ""}`}
        data-entity-key={`${ref.kind}:${ref.id}`}
        onClick={() => go(info.route!)}
      >
        {contents}
      </button>
    ) : (
      <div className="story-record">{contents}</div>
    );
  }
  const connector = (label: string) => (
    <div className="story-connector">
      <svg viewBox="0 0 80 20" aria-hidden="true">
        <path d="M2 10H72m-7-5 7 5-7 5" pathLength="100" />
      </svg>
      <span>{label}</span>
    </div>
  );
  const delay = (index: number): CSSProperties =>
    ({ "--story-delay": `${Math.min(index * 110, 1700)}ms` }) as CSSProperties;
  const stock = scene.stock;
  const balanceId = stock?.affectedEntityId;
  const originalBalance = state.domain.inventoryBalances.find(
    (b) => b.id === balanceId,
  );
  const savedBalance = committed?.inventoryBalances.find(
    (b) => b.id === balanceId,
  );
  const unit =
    state.domain.products.find((p) => p.id === originalBalance?.productId)
      ?.unit ?? "kg";
  const before = committed ? originalBalance?.quantity : stock?.values.before;
  const after = committed ? savedBalance?.quantity : stock?.values.after;
  const windowText = (schedule: Schedule) =>
    `${schedule.date ?? t("unknownStatus")} · ${schedule.startTime ?? "?"}–${schedule.endTime ?? "?"}`;
  return (
    <section
      ref={ref}
      className={`impact-story ${mode}`}
      aria-label={t("storyTitle")}
      data-story-mode={mode}
    >
      <div className="story-heading">
        <div>
          <h3>{t("storyTitle")}</h3>
          <small>{t("recordsCalculated")}</small>
        </div>
        <button
          type="button"
          className="button light story-replay"
          onClick={() => setPlay((value) => value + 1)}
        >
          <RotateCcw size={17} />
          {t("storyReplay")}
        </button>
      </div>
      <div
        className={`story-sequence ${visible ? "playing" : ""}`}
        key={`${play}:${JSON.stringify(draft)}:${mode}`}
      >
        <div
          className={`story-origin story-step ${draft.kind === "setAssetAvailability" && draft.availability === "broken" ? "breakdown" : ""}`}
        >
          <span className={`pill ${committed ? "green" : "yellow"}`}>
            {t(committed ? "storySaved" : "unconfirmedDraft")}
          </span>
          <h4>{t(draft.kind)}</h4>
          {node(scene.source)}
          {draft.kind === "setAssetAvailability" && (
            <strong className="story-availability">
              {t(
                draft.availability === "available"
                  ? "assetAvailable"
                  : draft.availability === "broken"
                    ? "assetBroken"
                    : draft.availability === "unavailable"
                      ? "assetUnavailable"
                      : "assetUnknown",
              )}
            </strong>
          )}
          <p>{t(committed ? "storySavedHint" : "storyPreviewHint")}</p>
          {draft.kind === "setAssetAvailability" &&
            draft.availability !== "available" && (
              <p className="story-repair">
                <Wrench size={18} />
                {scene.repair?.repairExpectedAt
                  ? t("storyRepairRecorded", {
                      date: scene.repair.repairExpectedAt,
                    })
                  : t("storyRepairUnknown")}
              </p>
            )}
        </div>
        {scene.schedule && (
          <div className="story-timeline story-step" style={delay(1)}>
            <h4>
              <CalendarClock size={20} />
              {t("storyTimeTitle")}
            </h4>
            <div className="story-time-track">
              <div>
                <small>{t("currentValue")}</small>
                <strong>{windowText(scene.schedule.before)}</strong>
              </div>
              <ArrowDown size={22} />
              <div className="story-time-proposed">
                <small>{t(committed ? "storySaved" : "proposedValue")}</small>
                <strong>{windowText(scene.schedule.after)}</strong>
                <span>{source.name}</span>
              </div>
            </div>
            <p className={`story-calendar-status ${scene.schedule.status}`}>
              {scene.schedule.status === "clear" ? (
                <CheckCircle2 size={18} />
              ) : scene.schedule.status === "conflict" ? (
                <TriangleAlert size={18} />
              ) : (
                <HelpCircle size={18} />
              )}
              {t(
                scene.schedule.status === "clear"
                  ? "storyNoConflict"
                  : scene.schedule.status === "conflict"
                    ? "storyConflict"
                    : "storyConflictUnknown",
              )}
            </p>
          </div>
        )}
        <div className="story-primary">
          {scene.nodes.map((entry, index) => (
            <div
              key={`${entry.ref.kind}:${entry.ref.id}`}
              className="story-step"
              style={delay(index + 1)}
            >
              {connector(t(entry.relation))}
              {node(entry.ref)}
            </div>
          ))}
        </div>
        {stock && (
          <div
            className="story-stock story-step"
            style={delay(scene.nodes.length + 1)}
          >
            {connector(
              t(
                draft.kind === "recordConsumption"
                  ? "storyConsumes"
                  : "storyStockLink",
              ),
            )}
            {node({
              kind: stock.affectedEntityType,
              id: stock.affectedEntityId,
            })}
            {typeof stock.values.after === "number" || committed ? (
              <div
                className="story-stock-equation"
                aria-label={t(committed ? "storySaved" : "stockPreview")}
              >
                <span>{amount(before, unit)}</span>
                <span aria-hidden="true">→</span>
                <strong className={committed ? "story-count-saved" : ""}>
                  {amount(after, unit)}
                </strong>
                <small>{t(committed ? "storySaved" : "storyIfApproved")}</small>
              </div>
            ) : (
              <p>{impactText(state, stock, language)}</p>
            )}
            {stock.evidenceRefs
              .filter((ref) => ref.kind === "storageLocation")
              .map((ref) => (
                <div className="story-store" key={ref.id}>
                  <span>{t("storyStoredIn")}</span>
                  {node(ref, true)}
                </div>
              ))}
          </div>
        )}
        <div className="story-branches">
          {scene.branches
            .filter(({ impact }) => impact.kind !== "scheduleUnknown")
            .map(({ impact, context }, index) => (
              <article
                key={impact.id}
                className={`story-branch story-step ${impact.severity}`}
                style={delay(scene.nodes.length + 2 + index)}
                data-impact-kind={impact.kind}
              >
                <small className="story-from">
                  {
                    recordInfo(state, {
                      kind: impact.sourceEntityType,
                      id: impact.sourceEntityId,
                    }).name
                  }
                </small>
                {connector(t(relationKey(impact)))}
                {node({
                  kind: impact.affectedEntityType,
                  id: impact.affectedEntityId,
                })}
                <p className="story-result">
                  {impact.certainty === "unknown" ? (
                    <HelpCircle size={18} />
                  ) : impact.severity === "info" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <TriangleAlert size={18} />
                  )}
                  <span>{impactText(display, impact, language)}</span>
                </p>
                <small>
                  {t(
                    impact.certainty === "confirmed"
                      ? "impactConfirmed"
                      : impact.certainty === "warning"
                        ? "impactWarning"
                        : "impactUnknown",
                  )}
                </small>
                <div className="story-context">
                  {context.map((ref) => (
                    <div key={`${ref.kind}:${ref.id}`}>{node(ref, true)}</div>
                  ))}
                </div>
              </article>
            ))}
        </div>
        {scene.branches.some(
          ({ impact }) => impact.kind === "scheduleUnknown",
        ) && (
          <details className="story-secondary">
            <summary>
              <HelpCircle size={18} />
              {t("storyUnknownLinks")}
            </summary>
            {scene.branches
              .filter(({ impact }) => impact.kind === "scheduleUnknown")
              .map(({ impact }) => (
                <article className="story-branch" key={impact.id}>
                  {connector(t("storyTimeUnknown"))}
                  {node({
                    kind: impact.affectedEntityType,
                    id: impact.affectedEntityId,
                  })}
                  <p className="story-result">
                    <HelpCircle size={18} />
                    <span>{impactText(display, impact, language)}</span>
                  </p>
                </article>
              ))}
          </details>
        )}
      </div>
    </section>
  );
}
