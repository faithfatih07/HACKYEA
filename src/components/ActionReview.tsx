import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { t, formatKg, localizeMessage } from "../i18n";
import { previewAction } from "../domain/actions";
import { createChangeDraft } from "../domain/drafts";
import { parseQuantity, parseCountQuantity } from "../domain/quantity";
import type { ActionDraft, Asset } from "../domain/types";
import type { FarmView } from "../domain/selectors";
import { DecisionImpacts, recordInfo } from "./DecisionImpacts";

export const assetStatusText = (status: Asset["availability"]) =>
  t(
    status === "available"
      ? "assetAvailable"
      : status === "broken"
        ? "assetBroken"
        : status === "unavailable"
          ? "assetUnavailable"
          : "assetUnknown",
  );
export const personStatusText = (status: string | undefined) =>
  t(
    status === "available"
      ? "availablePerson"
      : status === "unavailable"
        ? "unavailablePerson"
        : "unknownStatus",
  );
const taskChangeKeys = [
  "rescheduleTask",
  "assignTaskPerson",
  "assignTaskAssets",
  "changeTaskMaterial",
  "failTask",
  "completeTask",
  "linkServiceOffer",
] as const;

export function ActionReview({
  state,
  draft,
  setDraft,
  go,
  onConfirm,
  onCancel,
  error,
  busy,
  confirmationBlocked = false,
}: {
  state: FarmView;
  draft: ActionDraft;
  setDraft: (draft: ActionDraft) => void;
  go: (route: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string;
  busy: boolean;
  confirmationBlocked?: boolean;
}) {
  const [amountInput, setAmountInput] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const amountText = (value: number | null) =>
    amountInput?.id === draft.id ? amountInput.text : String(value ?? "");
  const preview = previewAction(state.domain, draft);
  const task =
    "taskId" in draft
      ? state.jobs.find((t) => t.id === draft.taskId)
      : undefined;
  const asset =
    draft.kind === "setAssetAvailability"
      ? state.machines.find((a) => a.id === draft.assetId)
      : undefined;
  const person =
    draft.kind === "setPersonAvailability"
      ? state.people.find((p) => p.id === draft.personId)
      : undefined;
  const balance =
    "inventoryBalanceId" in draft
      ? state.stocks.find((b) => b.id === draft.inventoryBalanceId)
      : undefined;
  const offers =
    state.domain.serviceOffers?.filter((o) => o.taskId === task?.id) ?? [];
  const scheduleText = (schedule: {
    date: string | null;
    startTime: string | null;
    endTime: string | null;
  }) =>
    `${schedule.date ?? t("unknownStatus")} · ${schedule.startTime ?? "?"}–${schedule.endTime ?? "?"}`;
  let before: string = t("notSpecified"),
    after: string = t("notSpecified");
  if (asset && draft.kind === "setAssetAvailability") {
    before = assetStatusText(asset.availability);
    after = assetStatusText(draft.availability);
  }
  if (person && draft.kind === "setPersonAvailability") {
    before = personStatusText(person.availability);
    after = personStatusText(draft.availability);
  }
  if (task && draft.kind === "rescheduleTask") {
    before = scheduleText(task.schedule);
    after = scheduleText(draft.schedule);
  }
  if (task && draft.kind === "assignTaskPerson") {
    before = state.people.find((p) => p.id === task.personId)?.name ?? before;
    after = state.people.find((p) => p.id === draft.personId)?.name ?? after;
  }
  if (task && draft.kind === "assignTaskAssets") {
    before = task.assetIds
      .map((id) => recordInfo(state, { kind: "asset", id }).name)
      .join(", ");
    after = draft.assetIds
      .map((id) => recordInfo(state, { kind: "asset", id }).name)
      .join(", ");
  }
  if (task && draft.kind === "changeTaskMaterial") {
    before = `${state.stocks.find((b) => b.id === task.stockId)?.name ?? "?"} · ${formatKg(task.plannedQuantity)}`;
    after = `${balance?.name ?? "?"} · ${formatKg(draft.plannedQuantity)}`;
  }
  if (balance && draft.kind === "correctInventory") {
    before = formatKg(balance.quantity);
    after = formatKg(draft.countedQuantity);
  }
  if (draft.kind === "completeTask") {
    before = t("planned2");
    after = t("completed");
  }
  if (draft.kind === "failTask") {
    before = t("planned2");
    after = draft.reason || t("failureReason");
  }
  if (draft.kind === "linkServiceOffer") {
    before =
      recordInfo(state, {
        kind: "serviceOffer",
        id: task?.serviceOfferId ?? "",
      }).name || t("notSpecified");
    after =
      offers.find((o) => o.id === draft.serviceOfferId)?.name ??
      t("notSpecified");
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (preview.valid && !busy && !confirmationBlocked) onConfirm();
      }}
    >
      <p className="notice">
        <Clock3 size={20} />
        {t("unchangedUntilApproval")}
      </p>
      <div className="form-grid decision-form">
        {"taskId" in draft && draft.kind !== "recordConsumption" && (
          <label className="full-width">
            {t("job")}
            <select
              value={draft.taskId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, taskId: e.target.value || null })
              }
            >
              <option value="">{t("notSpecified")}</option>
              {state.jobs
                .filter((j) => j.status === "planned")
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        {draft.kind === "setAssetAvailability" && (
          <label className="full-width">
            {t("machines")}
            <select
              value={draft.assetId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, assetId: e.target.value || null })
              }
            >
              <option value="">{t("notSpecified")}</option>
              {state.machines.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {task && taskChangeKeys.some((k) => k === draft.kind) && (
          <label className="full-width">
            {t("chooseChange")}
            <select
              value={draft.kind}
              onChange={(e) =>
                setDraft(
                  createChangeDraft(
                    state.domain,
                    e.target.value as ActionDraft["kind"],
                    task.id,
                  ),
                )
              }
            >
              {taskChangeKeys.map((kind) => (
                <option key={kind} value={kind}>
                  {t(kind)}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === "setAssetAvailability" && (
          <label className="full-width">
            {t("assetAvailability")}
            <select
              value={draft.availability}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  availability: e.target.value as Asset["availability"],
                })
              }
            >
              {(["available", "broken", "unavailable", "unknown"] as const).map(
                (status) => (
                  <option key={status} value={status}>
                    {assetStatusText(status)}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {draft.kind === "setPersonAvailability" && (
          <label className="full-width">
            {t("personAvailability")}
            <select
              value={draft.availability}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  availability: e.target.value as
                    "available" | "unavailable" | "unknown",
                })
              }
            >
              {["available", "unavailable", "unknown"].map((status) => (
                <option key={status} value={status}>
                  {personStatusText(status)}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === "rescheduleTask" && (
          <>
            <label className="full-width">
              {t("dateLabel")}
              <input
                type="date"
                required
                value={draft.schedule.date ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: {
                      ...draft.schedule,
                      date: e.target.value || null,
                    },
                  })
                }
              />
            </label>
            <label>
              {t("startTime")}
              <input
                type="time"
                required
                value={draft.schedule.startTime ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: {
                      ...draft.schedule,
                      startTime: e.target.value || null,
                    },
                  })
                }
              />
            </label>
            <label>
              {t("endTime")}
              <input
                type="time"
                required
                value={draft.schedule.endTime ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: {
                      ...draft.schedule,
                      endTime: e.target.value || null,
                    },
                  })
                }
              />
            </label>
            <p className="full-width fine-print">{t("scheduleHoursHint")}</p>
          </>
        )}
        {draft.kind === "assignTaskPerson" && (
          <label className="full-width">
            {t("assignedTo")}
            <select
              value={draft.personId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, personId: e.target.value || null })
              }
            >
              <option value="">{t("errorChoosePerson")}</option>
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === "assignTaskAssets" && (
          <fieldset className="full-width">
            <legend>{t("machinesChooseAtLeastOne")}</legend>
            <div className="machine-options">
              {state.machines.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={draft.assetIds.includes(a.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        assetIds: e.target.checked
                          ? [...draft.assetIds, a.id]
                          : draft.assetIds.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {draft.kind === "changeTaskMaterial" && (
          <>
            <label className="full-width">
              {t("material")}
              <select
                value={draft.inventoryBalanceId ?? ""}
                onChange={(e) => {
                  const b = state.stocks.find((b) => b.id === e.target.value);
                  setDraft({
                    ...draft,
                    inventoryBalanceId: b?.id ?? null,
                    productId: b?.productId ?? null,
                  });
                }}
              >
                <option value="">{t("errorChooseMaterial")}</option>
                {state.stocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              {t("plannedAmount")}
              <input
                inputMode="decimal"
                value={amountText(draft.plannedQuantity)}
                onChange={(e) => {
                  setAmountInput({ id: draft.id, text: e.target.value });
                  setDraft({
                    ...draft,
                    plannedQuantity: parseQuantity(e.target.value),
                  });
                }}
              />
            </label>
          </>
        )}
        {draft.kind === "correctInventory" && (
          <label className="full-width">
            {t("countedQuantity")}
            <input
              inputMode="decimal"
              value={amountText(draft.countedQuantity)}
              onChange={(e) => {
                setAmountInput({ id: draft.id, text: e.target.value });
                setDraft({
                  ...draft,
                  countedQuantity: parseCountQuantity(e.target.value),
                });
              }}
            />
          </label>
        )}
        {draft.kind === "failTask" && (
          <label className="full-width">
            {t("failureReason")}
            <textarea
              required
              value={draft.reason ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, reason: e.target.value || null })
              }
            />
          </label>
        )}
        {draft.kind === "linkServiceOffer" && (
          <label className="full-width">
            {t("serviceOffer")}
            <select
              value={draft.serviceOfferId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, serviceOfferId: e.target.value || null })
              }
            >
              <option value="">{t("errorOffer")}</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="decision-change">
        <div>
          <small>{t("currentValue")}</small>
          <strong>{before}</strong>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <small>{t("proposedValue")}</small>
          <strong>{after}</strong>
        </div>
      </div>
      <DecisionImpacts
        state={state}
        draft={draft}
        impacts={preview.impacts}
        go={go}
      />
      {preview.issues.length > 0 && (
        <div className="error-message" role="status">
          {preview.issues.map((issue, i) => (
            <p key={i}>{localizeMessage(issue.message)}</p>
          ))}
        </div>
      )}
      {error && (
        <div className="error-message" role="alert">
          {localizeMessage(error)}
        </div>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="button light"
          onClick={onCancel}
          disabled={busy}
        >
          {t("cancelDraft")}
        </button>
        <button
          className="button dark"
          disabled={!preview.valid || busy || confirmationBlocked}
        >
          {t("confirmSave")}
          <Check size={18} />
        </button>
      </div>
    </form>
  );
}
