import { domainMessage } from "../i18n/messages";
import type { MessageKey } from "../i18n/messages";
import { plannedDemand, isTaskBlocked } from "./selectors";
import { roundKg, isQuantity } from "./quantity";
import type {
  ActionDraft,
  EntityReference,
  FarmState,
  Impact,
  Task,
} from "./types";

export function draftSource(
  state: FarmState,
  draft: ActionDraft,
): EntityReference {
  if (draft.kind === "setAssetAvailability")
    return { kind: "asset", id: draft.assetId ?? "" };
  if (draft.kind === "setPersonAvailability")
    return { kind: "person", id: draft.personId ?? "" };
  if (draft.kind === "correctInventory")
    return { kind: "inventoryBalance", id: draft.inventoryBalanceId ?? "" };
  if (draft.kind === "createTask") return { kind: "task", id: draft.task.id };
  if ("taskId" in draft) return { kind: "task", id: draft.taskId ?? "" };
  return { kind: "farm", id: state.farm.id };
}

// A read-only projection, never a commit. This is shared by all proposals, including future AI.
export function projectDraft(state: FarmState, draft: ActionDraft): FarmState {
  let next = state;
  if (draft.kind === "createTask")
    return { ...state, tasks: [...state.tasks, draft.task] };
  if (draft.kind === "setAssetAvailability")
    return {
      ...state,
      assets: state.assets.map((a) =>
        a.id === draft.assetId ? { ...a, availability: draft.availability } : a,
      ),
    };
  if (draft.kind === "setPersonAvailability")
    return {
      ...state,
      people: state.people.map((p) =>
        p.id === draft.personId
          ? { ...p, availability: draft.availability }
          : p,
      ),
    };
  if ("taskId" in draft)
    next = {
      ...state,
      tasks: state.tasks.map((t) => {
        if (t.id !== draft.taskId) return t;
        switch (draft.kind) {
          case "rescheduleTask":
            return { ...t, schedule: { ...draft.schedule } };
          case "assignTaskPerson":
            return { ...t, personId: draft.personId ?? t.personId };
          case "assignTaskAssets":
            return { ...t, assetIds: [...draft.assetIds] };
          case "changeTaskMaterial":
            return {
              ...t,
              productId: draft.productId,
              inventoryBalanceId: draft.inventoryBalanceId,
              plannedQuantity:
                isQuantity(draft.plannedQuantity) && draft.plannedQuantity > 0
                  ? draft.plannedQuantity
                  : null,
            };
          case "recordConsumption":
          case "completeTask":
            return { ...t, status: "completed" as const };
          case "linkServiceOffer":
            return { ...t, serviceOfferId: draft.serviceOfferId };
          default:
            return t;
        }
      }),
    };
  if (draft.kind === "correctInventory" || draft.kind === "recordConsumption") {
    next = {
      ...next,
      inventoryBalances: state.inventoryBalances.map((b) =>
        b.id === draft.inventoryBalanceId
          ? {
              ...b,
              quantity:
                draft.kind === "correctInventory"
                  ? isQuantity(draft.countedQuantity)
                    ? draft.countedQuantity
                    : null
                  : b.quantity !== null &&
                      draft.actualQuantity !== null &&
                      isQuantity(draft.actualQuantity) &&
                      draft.actualQuantity > 0
                    ? roundKg(b.quantity - draft.actualQuantity)
                    : null,
            }
          : b,
      ),
    };
  }
  return next;
}

export function calculateImpacts(
  state: FarmState,
  draft: ActionDraft,
): Impact[] {
  const next = projectDraft(state, draft);
  const root = draftSource(state, draft);
  const impacts: Impact[] = [];
  const add = (
    classification: Impact["classification"],
    kind: Impact["kind"],
    messageKey: MessageKey,
    values: Impact["values"],
    records: EntityReference[],
    affected = records[records.length - 1] ?? root,
    level = 1,
    source = root,
    proposedChange: Impact["proposedChange"] = null,
    severity?: Impact["severity"],
    questionKey?: MessageKey,
  ) => {
    const evidenceRefs = [
      ...new Map(
        [source, affected, ...records].map((r) => [r.kind + ":" + r.id, r]),
      ).values(),
    ].filter((r) => r.id);
    impacts.push({
      id: `${draft.id}-${kind}-${source.kind}-${source.id}-${affected.kind}-${affected.id}-${impacts.length}`,
      sourceEntityType: source.kind,
      sourceEntityId: source.id,
      affectedEntityType: affected.kind,
      affectedEntityId: affected.id,
      relationType: kind,
      kind,
      severity:
        severity ?? (classification === "warning" ? "attention" : "info"),
      certainty: classification,
      classification,
      reason: domainMessage(messageKey, {
        ...values,
        unit:
          values.unit ??
          state.products.find((p) =>
            evidenceRefs.some((r) => r.kind === "product" && r.id === p.id),
          )?.unit ??
          "kg",
      }),
      messageKey,
      values,
      evidenceRefs,
      records: evidenceRefs,
      suggestedQuestion: questionKey
        ? domainMessage(questionKey)
        : classification === "unknown"
          ? domainMessage("questionMissingEvidence")
          : null,
      proposedChange,
      level,
    });
  };
  const ref = (kind: EntityReference["kind"], id: string): EntityReference => ({
    kind,
    id,
  });
  const taskRefs = (t: Task): EntityReference[] => [
    ref("task", t.id),
    ref("field", t.fieldId),
    ref("person", t.personId),
    ...t.assetIds.map((id) => ref("asset", id)),
  ];
  let direct: Task[] = [];
  if (root.kind === "asset" || root.kind === "person") {
    direct = next.tasks.filter(
      (t) =>
        t.status === "planned" &&
        (root.kind === "asset"
          ? t.assetIds.includes(root.id)
          : t.personId === root.id),
    );
    const resource =
      root.kind === "asset"
        ? next.assets.find((a) => a.id === root.id)
        : next.people.find((p) => p.id === root.id);
    const availability = resource?.availability ?? "unknown";
    for (const task of direct) {
      add(
        availability === "unknown"
          ? "unknown"
          : availability === "available"
            ? "confirmed"
            : "warning",
        root.kind === "asset" ? "assetUnavailable" : "personUnavailable",
        root.kind === "asset" ? "impactAssetLinked" : "impactPersonLinked",
        {
          task: task.title,
          taskId: task.id,
          ...(root.kind === "asset"
            ? { asset: resource?.name ?? root.id, assetId: root.id }
            : { person: resource?.name ?? root.id, personId: root.id }),
        },
        taskRefs(task),
        ref("task", task.id),
        1,
        root,
        { availability },
        availability === "broken" || availability === "unavailable"
          ? "blocked"
          : undefined,
      );
    }
    if (
      draft.kind === "setAssetAvailability" &&
      (draft.availability === "broken" || draft.availability === "unavailable")
    ) {
      const asset = state.assets.find((a) => a.id === draft.assetId);
      if (!asset?.repairExpectedAt)
        add(
          "unknown",
          "repairUnknown",
          "impactRepairUnknown",
          {},
          [root],
          root,
          1,
          root,
          null,
          "info",
          "questionRepairTime",
        );
    }
  } else if (root.kind === "task") {
    const task = next.tasks.find((t) => t.id === root.id);
    if (task) {
      direct = [task];
      add(
        "confirmed",
        "directTask",
        "impactTaskChange",
        { task: task.title, taskId: task.id },
        taskRefs(task),
        root,
        1,
        root,
        Object.fromEntries(
          Object.entries(draft).filter(
            ([key]) =>
              !["id", "farmId", "actorId", "completionId"].includes(key),
          ),
        ),
      );
    }
  }
  // Walk only actual dependency edges. Repeated direct/indirect relationships remain distinct evidence.
  const visit = (parent: Task, depth: number, path: Set<string>) => {
    for (const child of next.tasks.filter(
      (t) => t.status === "planned" && t.dependencyId === parent.id,
    )) {
      if (path.has(child.id)) continue;
      const key = `${parent.id}/${child.id}`;
      if (
        impacts.some(
          (i) =>
            i.kind === "dependentSchedule" &&
            i.sourceEntityId + "/" + i.affectedEntityId === key,
        )
      )
        continue;
      let certainty: Impact["classification"] =
        parent.status === "completed" ? "confirmed" : "warning";
      let message: MessageKey =
        parent.status === "completed"
          ? "impactDependencyReleased"
          : "impactDependencyLinked";
      if (draft.kind === "rescheduleTask") {
        const a = parent.schedule,
          b = child.schedule;
        const known = Boolean(
          a.date && b.date && (a.date !== b.date || (a.endTime && b.startTime)),
        );
        const earlier =
          known &&
          (b.date! < a.date! ||
            (a.date === b.date && b.startTime! < a.endTime!));
        certainty = !known ? "unknown" : earlier ? "warning" : "confirmed";
        message = !known
          ? "impactDependentUnknown"
          : earlier
            ? "impactDependentBefore"
            : "impactDependentSchedule";
      }
      add(
        certainty,
        "dependentSchedule",
        message,
        {
          task: child.title,
          taskId: child.id,
          parent: parent.title,
          parentId: parent.id,
        },
        [ref("task", parent.id), ...taskRefs(child)],
        ref("task", child.id),
        depth,
        ref("task", parent.id),
      );
      visit(child, depth + 1, new Set([...path, child.id]));
    }
  };
  for (const task of direct) visit(task, 2, new Set([task.id]));

  const checkedPairs = new Set<string>();
  for (const task of direct) {
    const taskRef = ref("task", task.id);
    if (isTaskBlocked(state, task))
      add(
        "warning",
        "dependency",
        "impactDependency",
        { task: task.title, taskId: task.id },
        [taskRef, ref("task", task.dependencyId!)],
        taskRef,
      );
    if (root.kind === "task") {
      for (const assetId of task.assetIds) {
        const asset = next.assets.find((a) => a.id === assetId);
        if (asset && asset.availability !== "available")
          add(
            asset.availability === "unknown" ? "unknown" : "warning",
            "assetUnavailable",
            "impactAssetLinked",
            { task: task.title, taskId: task.id, asset: asset.name, assetId },
            [taskRef, ref("asset", assetId)],
            ref("asset", assetId),
            1,
            taskRef,
            null,
            asset.availability === "unknown" ? "info" : "blocked",
          );
      }
      const person = next.people.find((p) => p.id === task.personId);
      if (person && person.availability !== "available")
        add(
          person.availability == null || person.availability === "unknown"
            ? "unknown"
            : "warning",
          "personUnavailable",
          "impactPersonLinked",
          {
            task: task.title,
            taskId: task.id,
            person: person.name,
            personId: person.id,
          },
          [taskRef, ref("person", person.id)],
          ref("person", person.id),
        );
    }
    for (const other of next.tasks.filter(
      (t) => t.status === "planned" && t.id !== task.id,
    )) {
      const samePerson = other.personId === task.personId;
      const assets = task.assetIds.filter((id) => other.assetIds.includes(id));
      if (!samePerson && !assets.length) continue;
      const pairKey = [task.id, other.id].sort().join("/");
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);
      const records = [
        taskRef,
        ref("task", other.id),
        ...assets.map((id) => ref("asset", id)),
        ...(samePerson ? [ref("person", task.personId)] : []),
      ];
      const a = task.schedule,
        b = other.schedule;
      if (a.date && b.date && a.date !== b.date) continue;
      const values = {
        task: other.title,
        taskId: other.id,
        resources: [
          ...(samePerson
            ? [
                next.people.find((p) => p.id === task.personId)?.name ??
                  task.personId,
              ]
            : []),
          ...assets.map(
            (id) => next.assets.find((a) => a.id === id)?.name ?? id,
          ),
        ].join(", "),
      };
      if (
        !a.date ||
        !b.date ||
        !a.startTime ||
        !a.endTime ||
        !b.startTime ||
        !b.endTime
      )
        add(
          "unknown",
          "scheduleUnknown",
          "impactScheduleUnknownResources",
          values,
          records,
          ref("task", other.id),
          1,
          taskRef,
          null,
          "info",
          "questionScheduleHours",
        );
      else if (a.startTime < b.endTime && b.startTime < a.endTime)
        add(
          "warning",
          "resourceConflict",
          "impactConflictResources",
          { ...values, date: a.date, start: a.startTime, end: a.endTime },
          records,
          ref("task", other.id),
          1,
          taskRef,
        );
    }
    if (draft.kind === "failTask")
      add(
        "warning",
        "taskFailure",
        "impactTaskFailed",
        { task: task.title, taskId: task.id, reason: draft.reason ?? "" },
        [taskRef],
        taskRef,
        1,
        root,
        { lastFailureReason: draft.reason },
      );
    if (draft.kind === "completeTask")
      add(
        "unknown",
        "costUnknown",
        "impactActualUnknown",
        {},
        taskRefs(task),
        taskRef,
      );
  }

  const balanceIds = new Set<string>();
  for (const task of direct)
    if (task.inventoryBalanceId) balanceIds.add(task.inventoryBalanceId);
  if ("inventoryBalanceId" in draft && draft.inventoryBalanceId)
    balanceIds.add(draft.inventoryBalanceId);
  if (draft.kind === "createTask" && draft.task.inventoryBalanceId)
    balanceIds.add(draft.task.inventoryBalanceId);
  if (draft.kind === "changeTaskMaterial") {
    const old = state.tasks.find((t) => t.id === draft.taskId);
    if (old?.inventoryBalanceId) balanceIds.add(old.inventoryBalanceId);
  }
  for (const id of balanceIds) {
    const before = state.inventoryBalances.find((b) => b.id === id),
      after = next.inventoryBalances.find((b) => b.id === id);
    if (!before || !after) continue;
    const balanceRef = ref("inventoryBalance", id);
    const records = [
      balanceRef,
      ref("product", after.productId),
      ref("storageLocation", after.storageLocationId),
    ];
    if (
      draft.kind === "recordConsumption" &&
      before.quantity !== null &&
      draft.actualQuantity !== null &&
      after.quantity !== null
    )
      add(
        "confirmed",
        "remainingStock",
        "impactRemainingStock",
        {
          before: before.quantity,
          used: draft.actualQuantity,
          after: after.quantity,
        },
        records,
        balanceRef,
        1,
        root,
        { quantity: after.quantity },
      );
    else if (draft.kind === "correctInventory" && after.quantity !== null)
      add(
        "confirmed",
        "remainingStock",
        "impactCorrectedStock",
        { before: before.quantity!, after: after.quantity },
        records,
        balanceRef,
        1,
        root,
        { quantity: after.quantity },
      );
    else
      add(
        after.quantity === null ? "unknown" : "confirmed",
        "remainingStock",
        after.quantity === null ? "impactStockUnknown" : "impactPlanStock",
        after.quantity === null ? {} : { available: after.quantity },
        records,
        balanceRef,
      );
    const demand = plannedDemand(next, id);
    const demandRefs = [
      ...records,
      ...demand.taskIds.map((id) => ref("task", id)),
    ];
    add(
      demand.total === null ? "unknown" : "confirmed",
      "plannedDemand",
      demand.total === null ? "impactDemandUnknown" : "impactPlannedDemand",
      demand.total === null
        ? { known: demand.knownQuantity }
        : { required: demand.total },
      demandRefs,
      balanceRef,
      2,
      balanceRef,
    );
    if (
      after.quantity !== null &&
      after.quantity >= 0 &&
      demand.knownQuantity > after.quantity
    )
      add(
        "warning",
        "shortage",
        "impactShortage",
        { missing: roundKg(demand.knownQuantity - after.quantity) },
        demandRefs,
        balanceRef,
        2,
        balanceRef,
      );
    for (const task of next.tasks.filter(
      (t) => t.status === "planned" && t.inventoryBalanceId === id,
    )) {
      const required = task.plannedQuantity,
        available = after.quantity;
      const known = required !== null && available !== null;
      add(
        !known ? "unknown" : required > available ? "warning" : "confirmed",
        "materialCoverage",
        !known ? "impactCoverageUnknown" : "impactTaskCoverage",
        {
          task: task.title,
          taskId: task.id,
          required: required ?? "?",
          available: available ?? "?",
          missing: known ? roundKg(Math.max(0, required - available)) : "?",
          unit:
            state.products.find((p) => p.id === after.productId)?.unit ?? "?",
        },
        [...records, ...taskRefs(task)],
        ref("task", task.id),
        2,
        balanceRef,
      );
    }
    const product = state.products.find((p) => p.id === after.productId);
    const quantity =
      draft.kind === "recordConsumption"
        ? draft.actualQuantity
        : draft.kind === "completeTask"
          ? null
          : root.kind === "task"
            ? next.tasks.find((t) => t.id === root.id)?.plannedQuantity
            : demand.total;
    if (
      quantity !== undefined &&
      quantity !== null &&
      isQuantity(quantity) &&
      product?.unitPrice != null
    )
      add(
        "confirmed",
        "cost",
        "impactMaterialCost",
        {
          amount: roundKg(quantity * product.unitPrice),
          currency: product.currency ?? "?",
        },
        records,
        ref("product", product.id),
        2,
        balanceRef,
      );
    else
      add(
        "unknown",
        "costUnknown",
        "impactPriceUnknown",
        {},
        records,
        ref("product", after.productId),
        2,
        balanceRef,
        null,
        "info",
        "questionPrice",
      );
  }
  if (draft.kind === "changeTaskMaterial") {
    const oldTask = state.tasks.find((t) => t.id === draft.taskId);
    const oldProduct = state.products.find((p) => p.id === oldTask?.productId);
    const newProduct = state.products.find((p) => p.id === draft.productId);
    const refs = [
      root,
      ...(oldProduct ? [ref("product", oldProduct.id)] : []),
      ...(newProduct ? [ref("product", newProduct.id)] : []),
    ];
    if (
      oldTask?.plannedQuantity != null &&
      oldProduct?.unitPrice != null &&
      newProduct?.unitPrice != null &&
      isQuantity(draft.plannedQuantity) &&
      oldProduct.currency === newProduct.currency &&
      newProduct.currency
    ) {
      const before = roundKg(oldTask.plannedQuantity * oldProduct.unitPrice),
        after = roundKg(draft.plannedQuantity * newProduct.unitPrice);
      add(
        "confirmed",
        "cost",
        "impactCostChange",
        {
          before,
          after,
          difference: roundKg(after - before),
          currency: newProduct.currency,
        },
        refs,
        root,
        2,
        root,
        { plannedCost: after },
      );
    } else
      add(
        "unknown",
        "costUnknown",
        "impactCostChangeUnknown",
        {},
        refs,
        root,
        2,
        root,
        null,
        "info",
        "questionPrice",
      );
  }
  if (draft.kind === "linkServiceOffer") {
    const offer = state.serviceOffers?.find(
      (o) => o.id === draft.serviceOfferId && o.taskId === draft.taskId,
    );
    if (offer) {
      const offerRef = ref("serviceOffer", offer.id);
      add(
        "confirmed",
        "serviceAlternative",
        "impactOfferAlternative",
        { offer: offer.name, offerId: offer.id },
        [root, offerRef],
        offerRef,
        1,
        root,
        { serviceOfferId: offer.id },
      );
      if (offer.price !== null && offer.transportCost !== null)
        add(
          "confirmed",
          "cost",
          "impactOfferCost",
          {
            offer: offer.name,
            offerId: offer.id,
            amount: roundKg(offer.price + offer.transportCost),
            currency: offer.currency,
          },
          [root, offerRef],
          offerRef,
          2,
          offerRef,
        );
      else
        add(
          "unknown",
          "costUnknown",
          "impactOfferCostUnknown",
          { offer: offer.name, offerId: offer.id },
          [root, offerRef],
          offerRef,
          2,
          offerRef,
          null,
          "info",
          "questionTransportCost",
        );
      if (offer.durationHours === null)
        add(
          "unknown",
          "scheduleUnknown",
          "impactOfferHoursUnknown",
          { offer: offer.name, offerId: offer.id },
          [root, offerRef],
          offerRef,
          2,
          offerRef,
          null,
          "info",
          "questionScheduleHours",
        );
    }
  }
  return impacts;
}
