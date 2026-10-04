import {
  t,
  useLanguage,
  setLanguage,
  localizeFarm,
  localizeMessage,
  formatKg,
  formatDate,
} from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Home,
  Leaf,
  Link2,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  Shovel,
  Sprout,
  Tractor,
  TriangleAlert,
  Users,
  Warehouse,
  X,
} from "lucide-react";

import { Dialog } from "./components/Dialog";
import { DecisionImpacts } from "./components/DecisionImpacts";
import {
  ActionReview,
  assetStatusText,
  personStatusText,
} from "./components/ActionReview";
import { createChangeDraft } from "./domain/drafts";
import { useFarm } from "./hooks/useFarm";
import { createId } from "./domain/id";
import {
  consumptionAction,
  planAction,
  sowingAction,
  getShortages,
  previewOperation,
} from "./domain/operations";
import { demoInterpreter } from "./interpreter/demoInterpreter";
import { requestInterpretation } from "./ai/client";
import { adaptActionDraft } from "./ai/adaptDraft";
import { localDocumentInterpretation } from "./ai/answers";
import {
  documentProducts,
  documentSections,
  isDocumentQuestion,
} from "./ai/documents";
import type { DocumentInterpretation } from "./ai/schema";
import { DocumentQuestion, SourceCards } from "./components/DocumentQuestion";
import { AIReviewNote } from "./components/AIReviewNote";
import type { AIReviewMetadata } from "./components/AIReviewNote";
import type { ActionDraft, OperationDraft, PlanDraft } from "./domain/types";
import {
  isTaskBlocked,
  inventorySummary,
  hasUnknownPlanning,
  selectFarmView,
} from "./domain/selectors";
import { previewAction } from "./domain/actions";
import type { FarmView as FarmState, Job } from "./domain/selectors";
import type { MessageKey } from "./i18n/messages";

const kg = formatKg;
const initialRoute = () => window.location.hash.replace(/^#\/?/, "") || "today";
type Category = "fields" | "inventory" | "machines" | "team";
const getCategories = (): {
  id: Category;
  title: string;
  subtitle: string;
}[] => [
  { id: "fields", title: t("fields"), subtitle: t("aLittleRoomToGrow") },
  {
    id: "inventory",
    title: t("inventory"),
    subtitle: t("everythingInItsPlace"),
  },
  { id: "machines", title: t("machines"), subtitle: t("yourTrustyWorkhorses") },
  { id: "team", title: t("team"), subtitle: t("goodHandsGoodHarvests") },
];

export default function App() {
  const language = useLanguage();
  const categories = getCategories();
  const {
    state: rawState,
    storageError,
    confirm: confirmDraft,
    reset,
  } = useFarm();
  const state = useMemo(
    () => localizeFarm(rawState, language),
    [rawState, language],
  );
  const [route, setRoute] = useState(initialRoute);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [modal, setModal] = useState<"plan" | "reset" | "docs" | null>(null);
  const [changeDraft, setChangeDraft] = useState<ActionDraft | null>(null);
  const [showChange, setShowChange] = useState(false);
  const [sowingId, setSowingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [interpreterError, setInterpreterError] = useState("");
  const [actionError, setActionError] = useState("");
  const [aiProvider, setAIProvider] = useState<"demo" | "gemini">("demo");
  const [aiMetadata, setAIMetadata] = useState<AIReviewMetadata | null>(null);
  const [aiAcknowledged, setAIAcknowledged] = useState(false);
  const [documentEntry, setDocumentEntry] = useState<{
    question: string;
    result: DocumentInterpretation;
  } | null>(null);
  const aiQuestionsPending = Boolean(
    aiMetadata?.questions.length && !aiAcknowledged,
  );
  const [toast, setToast] = useState<{
    key: MessageKey;
    values: Record<string, number>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const entryRef = useRef<HTMLTextAreaElement>(null);
  const [section, id] = route.split("/");
  const activeTab =
    section === "today" ? "today" : section === "jobs" ? "jobs" : "farm";
  const planned = state.jobs.filter((job) => job.status === "planned");
  const shortages = getShortages(state);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("pageTitle");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("pageDescription"));
  }, [language]);

  useEffect(() => {
    const onHash = () => {
      setRoute(initialRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(null), 7000);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);
  const go = (next: string) => {
    window.location.hash = `/${next}`;
    setShowDraft(false);
    setModal(null);
    setSowingId(null);
    setShowChange(false);
    setActionError("");
  };
  const notify = (key: MessageKey, values: Record<string, number> = {}) => {
    setToast({ key, values });
    setActionError("");
  };
  const startChange = (kind: ActionDraft["kind"], targetId: string) => {
    setAIMetadata(null);
    setChangeDraft(createChangeDraft(rawState, kind, targetId));
    setShowChange(true);
    setActionError("");
  };
  const startDraft = (job: Job) => {
    setAIMetadata(null);
    setDraft({
      id: createId(),
      jobId: job.id,
      fieldId: job.fieldId,
      stockId: job.stockId ?? "",
      quantity: job.plannedQuantity === null ? "" : String(job.plannedQuantity),
    });
    setActionError("");
    setShowDraft(true);
  };
  const interpret = async () => {
    setInterpreterError("");
    setBusy(true);
    setAIMetadata(null);
    setAIAcknowledged(false);
    setDocumentEntry(null);
    try {
      const response = await requestInterpretation(text, rawState, language);
      setAIProvider(response.provider);
      if (response.provider === "gemini") {
        if (response.result.mode === "DOCUMENT_ANSWER") {
          setDocumentEntry({ question: text, result: response.result });
          return;
        }
        const adapted = adaptActionDraft(
          rawState,
          response.result,
          undefined,
          text,
        );
        setAIMetadata({
          summary: response.result.userFacingSummary,
          questions: adapted.questions,
          bagConversion: adapted.bagConversion,
        });
        if (adapted.draft.kind === "recordConsumption") {
          const action = adapted.draft;
          setDraft({
            id: action.id,
            jobId: action.taskId ?? "",
            fieldId: action.fieldId ?? "",
            stockId: action.inventoryBalanceId ?? "",
            quantity:
              action.actualQuantity === null
                ? ""
                : String(action.actualQuantity),
          });
          setShowDraft(true);
        } else {
          setChangeDraft(adapted.draft);
          setShowChange(true);
        }
        setActionError("");
        return;
      }
      if (response.reason !== "no_key")
        setInterpreterError(t("aiFallbackNotice"));
      // Read-only document lookup is available even without a model, clearly labelled.
      if (isDocumentQuestion(text)) {
        setDocumentEntry({
          question: text,
          result: localDocumentInterpretation(text),
        });
        return;
      }
      const result = await demoInterpreter.interpret(text, rawState);
      if (result.kind === "unsupported") {
        setInterpreterError(result.message);
        return;
      }
      const singleField =
        result.fieldIds.length === 1 ? result.fieldIds[0] : "";
      // Missing or ambiguous fields always require a user choice, even if only one job remains.
      const jobId =
        singleField && result.jobIds.length === 1 ? result.jobIds[0] : "";
      setDraft({
        id: createId(),
        jobId,
        fieldId: singleField,
        stockId: result.stockIds.length === 1 ? result.stockIds[0] : "",
        quantity: result.quantity,
      });
      setActionError("");
      setShowDraft(true);
    } catch {
      setAIProvider("demo");
      setInterpreterError(t("aiInvalidNotice"));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!draft || busy || aiQuestionsPending) return;
    setBusy(true);
    setActionError("");
    try {
      const action = consumptionAction(rawState, draft);
      const committed = await confirmDraft(action, {
        approved: true,
        draftId: action.id,
        expectedRevision: state.revision,
      });
      const next = selectFarmView(committed);
      const record = next.consumptions.find(
        (item) => item.operationId === draft.id || item.jobId === draft.jobId,
      );
      notify(
        record
          ? "allRecordedAmountUsedAmountInStock"
          : "thisJobHasAlreadyBeenRecordedStockWasNotChanged",
        record
          ? {
              value0: record.quantity,
              value1: record.after,
            }
          : {},
      );
      setDraft(null);
      setShowDraft(false);
      setText("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t("couldNotSavePleaseTryAgain"),
      );
    } finally {
      setBusy(false);
    }
  };
  const categoryCount = (category: Category) =>
    ({
      fields: t("3Fields90Decares"),
      inventory: t("amountMaterial2Stores", { value0: state.stocks.length }),
      machines: t("4FarmCompanions"),
      team: t("3FamiliarFaces"),
    })[category];
  const jobBlocked = (job: Job) =>
    isTaskBlocked(
      rawState,
      rawState.tasks.find((task) => task.id === job.id)!,
    );

  const jobCard = (job: Job, compact = false) => (
    <button
      key={job.id}
      className={`job-row ${compact ? "compact" : ""}`}
      onClick={() => go(`jobs/${job.id}`)}
    >
      <span
        className={`job-icon ${job.status === "completed" ? "done" : job.type === "sowing" ? "sow" : ""}`}
      >
        {job.status === "completed" ? (
          <CheckCheck size={24} />
        ) : job.type === "sowing" ? (
          <Sprout size={24} />
        ) : (
          <Shovel size={23} />
        )}
      </span>
      <span className="job-content">
        <span className="job-title">{job.title}</span>
        <span className="job-meta">
          {state.people.find((person) => person.id === job.personId)?.name}{" "}
          <span>·</span>{" "}
          {job.stockId
            ? kg(job.plannedQuantity) + t("planned")
            : t("wheatPlan")}
        </span>
        {!compact && (
          <span className="job-resources">
            <Tractor size={13} />{" "}
            {job.machineIds
              .map(
                (id) =>
                  state.machines.find((machine) => machine.id === id)?.name,
              )
              .join(" + ")}
          </span>
        )}
      </span>
      <span
        className={`pill ${job.status === "completed" ? "green" : jobBlocked(job) ? "neutral" : "yellow"}`}
      >
        {job.status === "completed"
          ? t("done")
          : jobBlocked(job)
            ? t("waiting")
            : t("planned2")}
      </span>
      <ChevronRight className="row-chevron" size={18} />
    </button>
  );
  const resource = (label: string, next: string, icon?: ReactNode) => (
    <button key={next} className="resource-link" onClick={() => go(next)}>
      {icon || <Link2 size={15} />}
      {label}
      <ArrowUpRight size={14} />
    </button>
  );
  const empty = (title: string, subtitle: string) => (
    <div className="empty-state">
      <Sprout size={32} />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
  const back = (label: string, next: string) => (
    <button className="back-link" onClick={() => go(next)}>
      <ArrowLeft size={17} />
      {label}
    </button>
  );
  const pageHeading = (
    eyebrow: string,
    title: string,
    description: string,
    action?: ReactNode,
  ) => (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
  const jobsPanel = (jobs: Job[], title = t("linkedJobs")) => (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="count-bubble">{jobs.length}</span>
      </div>
      {jobs.length
        ? jobs.map((job) => jobCard(job))
        : empty(t("nothingOnTheListYet"), t("newPlannedJobsWillAppearHere"))}
    </section>
  );
  const consumptionPanel = (stockId?: string) => {
    const records = state.consumptions
      .filter((item) => !stockId || item.stockId === stockId)
      .slice()
      .reverse();
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>{t("consumptionLog")}</h2>
          <BookOpen size={19} />
        </div>
        {records.length
          ? records.map((record) => (
              <div className="log-row" key={record.id}>
                <span className="log-icon">
                  <ArrowDown size={19} />
                </span>
                <div>
                  <strong>
                    {t("amountUsed", { value0: kg(record.quantity) })}
                  </strong>
                  <p>
                    {resource(
                      state.jobs.find((job) => job.id === record.jobId)
                        ?.title || t("job"),
                      `jobs/${record.jobId}`,
                    )}
                  </p>
                  <small>
                    {formatDate(record.createdAt)} · {kg(record.before)} →{" "}
                    {kg(record.after)}
                  </small>
                </div>
              </div>
            ))
          : empty(t("aFreshPage"), t("confirmedMaterialUseWillBeRecordedHere"))}
      </section>
    );
  };

  let content: ReactNode;
  if (section === "today")
    content = (
      <>
        <section className="farm-heading">
          <div className="farm-heading-icon">
            <Sprout size={28} />
          </div>
          <div>
            <span className="eyebrow">{t("dailyOperations")}</span>
            <h1>{t("muratSFarm")}</h1>
            <p>{t("3Fields90Decares")}</p>
          </div>
          <button
            className="button dark"
            onClick={() => {
              setModal("plan");
              setActionError("");
            }}
          >
            <Plus size={18} />
            {t("planAJob")}
          </button>
        </section>
        <div className="dashboard-grid">
          <div className="dashboard-left">
            <section className="panel jobs-panel">
              <div className="panel-heading">
                <h2>
                  {t("onTheToDoList")}{" "}
                  <span className="count-bubble">{planned.length}</span>
                </h2>
                <button className="text-button" onClick={() => go("jobs")}>
                  {t("allJobs")}
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="panel-subtitle">
                {t("oneThingAtATimeYouVeGotThis")}
              </div>
              {planned.length
                ? planned.map((job) => jobCard(job, true))
                : empty(
                    t("aJobWellDone"),
                    t("yourPlannedJobsAreAllCompleteTimeForALittleBreather"),
                  )}
              <button
                className="add-job"
                onClick={() => {
                  setModal("plan");
                  setActionError("");
                }}
              >
                <Plus size={18} />
                {t("planAJob")}
              </button>
            </section>
            <section className="heads-up">
              <div className="section-label">
                <TriangleAlert size={18} />
                {t("stockShortfall")}
              </div>
              {shortages.length ? (
                shortages.map((shortage) => (
                  <div key={shortage.stockId} className="warning-content">
                    <div>
                      <h3>
                        {t("amountNeededForPlannedWork", {
                          value0: kg(shortage.missing),
                        })}
                      </h3>
                      <p>
                        {t("amountAmountInStockAmountPlanned", {
                          value0: state.stocks.find(
                            (item) => item.id === shortage.stockId,
                          )?.name,
                          value1: kg(shortage.available),
                          value2: kg(shortage.required),
                        })}
                      </p>
                      {shortage.isMinimum && <p>{t("unknownPlanning")}</p>}
                      <div className="inline-links">
                        {resource(
                          t("checkInventory"),
                          `inventory/${shortage.stockId}`,
                        )}
                        {shortage.jobIds.map((id) =>
                          resource(
                            state.jobs.find((job) => job.id === id)!.title,
                            `jobs/${id}`,
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="warning-content">
                  <CheckCircle2 size={25} />
                  <div>
                    <h3>
                      {hasUnknownPlanning(rawState)
                        ? t("impactUnknown")
                        : t("theStockPlanAddsUp")}
                    </h3>
                    <p>
                      {hasUnknownPlanning(rawState)
                        ? t("unknownPlanning")
                        : t("availableMaterialsCoverTheRemainingPlannedWork")}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
          <div className="dashboard-right">
            <section className="notebook">
              <div className="notebook-label">
                <span>
                  <BookOpen size={17} />
                  {t("yourFarmNotebook")}
                </span>
              </div>
              <h2>{t("whatHappenedOnTheFarm")}</h2>
              <p>{t("jotItDownReviewItBackToTheFields")}</p>
              <label htmlFor="farm-entry" className="sr-only">
                {t("whatHappenedOnTheFarm")}
              </label>
              <textarea
                ref={entryRef}
                id="farm-entry"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setInterpreterError("");
                }}
                placeholder={t("eGKuzeyTarlasNda600KgGubreKullandM")}
                rows={3}
                maxLength={500}
              />
              <button
                className="button dark full"
                onClick={interpret}
                disabled={!text.trim() || busy}
              >
                {t(busy ? "aiLoading" : "reviewEntry")}
                <ArrowRight size={18} />
              </button>
              {interpreterError && (
                <div className="error-message" role="alert">
                  {localizeMessage(interpreterError)}
                </div>
              )}
              <div className="interpreter-label">
                <span className="demo-dot" />
                {t(
                  aiProvider === "gemini" ? "geminiLabel" : "interpreterLabel",
                )}
              </div>
              <p className="fine-print">{t("aiPrivacy")}</p>
              {documentEntry && (
                <DocumentQuestion
                  key={documentEntry.question}
                  state={rawState}
                  initialQuestion={documentEntry.question}
                  initialResult={documentEntry.result}
                  initialProvider={aiProvider}
                  onProvider={setAIProvider}
                />
              )}
              <details
                className="examples"
                open={Boolean(interpreterError) || undefined}
              >
                <summary>{t("needAStartingPoint")}</summary>
                <p>
                  {t(
                    "thesePhrasesWorkInEnglishOrTurkishMissingDetailsWillNeedYourSelection",
                  )}
                </p>
                {[
                  t("exampleFull"),
                  t("exampleMissingField"),
                  t("exampleMissingAmount"),
                ].map((example) => (
                  <button
                    onClick={() => {
                      setText(example);
                      setInterpreterError("");
                      entryRef.current?.focus();
                    }}
                    key={example}
                  >
                    {example}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </details>
              <div className="notebook-rule">
                <ShieldCheck size={14} />
                {t("nothingChangesUntilYouConfirm")}
              </div>
            </section>
            <button
              className="documents-teaser"
              onClick={() => setModal("docs")}
            >
              <span className="document-doodle">
                <FileText size={26} />
              </span>
              <span>
                <strong>{t("aHomeForYourDocuments")}</strong>
                <small>{t("labelsGuidesNotConnectedYet")}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        <section className="farm-shortcuts" aria-label={t("exploreYourFarm")}>
          {categories.map((category) => (
            <button
              key={category.id}
              className={`shortcut ${category.id}`}
              onClick={() => go(category.id)}
            >
              <CategoryIcon type={category.id} />
              <div>
                <h2>{category.title}</h2>
                <p>{categoryCount(category.id)}</p>
              </div>
              <span className="shortcut-arrow">
                <ArrowUpRight size={18} />
              </span>
            </button>
          ))}
        </section>
      </>
    );
  else if (section === "jobs" && !id)
    content = (
      <JobsScreen
        state={state}
        go={go}
        openPlan={() => {
          setModal("plan");
          setActionError("");
        }}
        jobCard={jobCard}
        empty={empty}
      />
    );
  else if (section === "jobs" && id) {
    const job = state.jobs.find((item) => item.id === id);
    if (!job) content = <NotFound go={go} />;
    else {
      const field = state.fields.find((item) => item.id === job.fieldId)!;
      const person = state.people.find((item) => item.id === job.personId)!;
      const stock = state.stocks.find((item) => item.id === job.stockId);
      const record = state.consumptions.find((item) => item.jobId === job.id);
      content = (
        <>
          {back(t("allJobs"), "jobs")}
          {pageHeading(
            t("theWorkAllTogether"),
            job.title,
            t("amountFictionalDemoPlan", { value0: job.scheduled }),
            <span
              className={`pill large ${job.status === "completed" ? "green" : jobBlocked(job) ? "neutral" : "yellow"}`}
            >
              {job.status === "completed"
                ? t("completed")
                : jobBlocked(job)
                  ? t("waitingForPrerequisite")
                  : t("planned2")}
            </span>,
          )}
          <div className="detail-grid">
            <section className="panel detail-panel">
              <h2>{t("whatSInvolved")}</h2>
              <DetailRow label={t("field")}>
                {resource(
                  t("amountAmountDecares", {
                    value0: field.name,
                    value1: field.area,
                  }),
                  `fields/${field.id}`,
                  <MapPin size={16} />,
                )}
              </DetailRow>
              <DetailRow label={t("assignedTo")}>
                {resource(
                  person.name,
                  `team/${person.id}`,
                  <Users size={16} />,
                )}
              </DetailRow>
              <DetailRow label={t("machines")}>
                <div className="resource-stack">
                  {job.machineIds.map((id) => (
                    <span key={id}>
                      {resource(
                        state.machines.find((machine) => machine.id === id)!
                          .name,
                        `machines/${id}`,
                        <Tractor size={16} />,
                      )}
                    </span>
                  ))}
                </div>
              </DetailRow>
              <DetailRow label={t("material")}>
                {stock ? (
                  resource(
                    stock.name,
                    `inventory/${stock.id}`,
                    <Package size={16} />,
                  )
                ) : (
                  <span>{t("seedMaterialNotEnteredInThisDemo")}</span>
                )}
              </DetailRow>
              <DetailRow label={t("scheduleRecorded")}>
                {job.schedule.date ?? t("unknownStatus")} ·{" "}
                {job.schedule.startTime ?? "?"}–{job.schedule.endTime ?? "?"}
              </DetailRow>
              {job.lastFailureReason && (
                <DetailRow label={t("lastFailureReason")}>
                  {job.lastFailureReason}
                </DetailRow>
              )}
              {job.serviceOfferId && (
                <DetailRow label={t("linkedAlternative")}>
                  {resource(
                    rawState.serviceOffers?.find(
                      (o) => o.id === job.serviceOfferId,
                    )?.name ?? job.serviceOfferId,
                    `services/${job.serviceOfferId}`,
                  )}
                </DetailRow>
              )}
              {job.status === "planned" && (
                <div className="decision-entry-actions">
                  <button
                    className="button light full"
                    onClick={() => startChange("rescheduleTask", job.id)}
                  >
                    <Clock3 size={18} />
                    {t("moveToMonday")}
                  </button>
                  <button
                    className="button light full"
                    onClick={() => startChange("assignTaskPerson", job.id)}
                  >
                    {t("changeTask")}
                  </button>
                </div>
              )}
              <DetailRow label={t("plannedAmount")}>
                {stock ? kg(job.plannedQuantity) : t("notSpecified")}
              </DetailRow>
              {record && (
                <DetailRow label={t("actualUse")}>
                  <strong>{kg(record.quantity)}</strong>
                </DetailRow>
              )}
              {job.dependencyId && (
                <DetailRow label={t("prerequisite")}>
                  {resource(
                    state.jobs.find((item) => item.id === job.dependencyId)!
                      .title,
                    `jobs/${job.dependencyId}`,
                  )}
                </DetailRow>
              )}
            </section>
            <div>
              <section className="panel detail-panel action-panel">
                <span className="action-illustration">
                  {job.status === "completed" ? (
                    <CheckCheck size={36} />
                  ) : (
                    <ClipboardList size={36} />
                  )}
                </span>
                <h2>
                  {job.status === "completed"
                    ? t("inTheBooks")
                    : t("finishedInTheField")}
                </h2>
                <p>
                  {job.status === "completed"
                    ? t(
                        "thisCompletedJobIsProtectedAgainstDuplicateStockDeductions",
                      )
                    : jobBlocked(job)
                      ? t("thisJobCanBeCompletedAfterItsPrerequisiteIsDone")
                      : t("checkTheDetailsAndConfirmWhatActuallyHappened")}
                </p>
                {job.status === "planned" && (
                  <button
                    className="button dark full"
                    disabled={jobBlocked(job)}
                    onClick={() =>
                      job.type === "fertilizing"
                        ? startDraft(job)
                        : setSowingId(job.id)
                    }
                  >
                    {jobBlocked(job) ? (
                      <>
                        <Clock3 size={17} />
                        {t("waitingForFertilizing")}
                      </>
                    ) : (
                      <>
                        {t("recordCompletion")}
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                )}
                {record && (
                  <div className="saved-receipt">
                    <CheckCircle2 size={17} />
                    {t("stockUpdated")}
                    {kg(record.before)} → {kg(record.after)}
                    <small>{formatDate(record.createdAt)}</small>
                  </div>
                )}
              </section>
              <p className="fine-print">
                {t(
                  "theseQuantitiesAreFictionalWorkPlansNotAgriculturalDoseRecommendations",
                )}
              </p>
            </div>
          </div>
        </>
      );
    }
  } else if (section === "farm")
    content = (
      <>
        {pageHeading(
          t("rootedInOnePlace"),
          t("myFarm"),
          t("yourFieldsSuppliesMachinesAndPeopleAllConnected"),
        )}
        <div className="farm-category-grid">
          {categories.map((category) => (
            <button
              className={`farm-category ${category.id}`}
              key={category.id}
              onClick={() => go(category.id)}
            >
              <CategoryIcon type={category.id} />
              <div>
                <h2>{category.title}</h2>
                <p>{category.subtitle}</p>
                <strong>{categoryCount(category.id)}</strong>
              </div>
              <ArrowUpRight size={23} />
            </button>
          ))}
        </div>
        <section className="farm-info panel">
          <div className="avatar green">MD</div>
          <div>
            <h2>Murat Demir</h2>
            <p>{t("farmOwnerSingleDemoUser")}</p>
          </div>
          <span className="pill yellow">{t("demoAccount")}</span>
        </section>
        <section className="panel detail-panel">
          <h2>{t("yourLittleDigitalFarm")}</h2>
          <p>
            {t(
              "thisIsAFictionalSampleFarmStoredInThisBrowserNoSensorsSignInOrTeamPerm",
            )}
          </p>
          <div className="farm-settings">
            <button className="button light" onClick={() => setModal("docs")}>
              <FileText size={18} />
              {t("documentSupport")}{" "}
              <span className="pill neutral">{t("syntheticDocument")}</span>
            </button>
            <button
              className="button danger-light"
              onClick={() => {
                setModal("reset");
                setActionError("");
              }}
            >
              <RotateCcw size={17} />
              {t("resetDemoData")}
            </button>
          </div>
        </section>
      </>
    );
  else if (section === "fields" && !id)
    content = (
      <>
        {back(t("myFarm"), "farm")}
        {pageHeading(
          t("knowEveryCorner"),
          t("yourFields"),
          t("3Fields90Decares9HectaresOfFictionalFarmland"),
        )}
        <div className="field-grid">
          {state.fields.map((field) => (
            <button
              className={`field-card ${field.color}`}
              key={field.id}
              onClick={() => go(`fields/${field.id}`)}
            >
              <div className="field-picture">
                <div className="field-horizon" />
                <Sprout size={58} strokeWidth={1.7} />
                <span>{field.crop}</span>
              </div>
              <div className="field-card-body">
                <div>
                  <h2>{field.name}</h2>
                  <ArrowUpRight size={21} />
                </div>
                <p>
                  {field.area} {t("decares")}
                  <span>·</span> {field.area / 10} ha
                </p>
                <span
                  className={`pill ${field.stage === "Growing" ? "green" : "yellow"}`}
                >
                  {field.stage === "Planned"
                    ? t("amountPlanned", { value0: field.crop })
                    : t("amountGrowing", { value0: field.crop })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  else if (section === "fields" && id) {
    const field = state.fields.find((item) => item.id === id);
    content = field ? (
      <>
        {back(t("allFields"), "fields")}
        {pageHeading(
          t("aPatchOfPossibility"),
          t("amountField", { value0: field.name }),
          t("amountDecaresAmountHectaresFictionalDemoField", {
            value0: field.area,
            value1: field.area / 10,
          }),
        )}
        <section className="panel detail-panel">
          <div className="field-detail-banner">
            <CategoryIcon type="fields" />
            <div>
              <h2>{field.crop}</h2>
              <p>
                {field.stage === "Growing"
                  ? t("growingSampleCropRecord")
                  : t("plannedCropNotYetRecordedAsSown")}
              </p>
            </div>
            <span
              className={`pill ${field.stage === "Growing" ? "green" : "yellow"}`}
            >
              {field.stage === "Planned"
                ? t("planned2")
                : t("growingSampleCropRecord")}
            </span>
          </div>
          <p className="fine-print">
            {t(
              "cropStatusIsSampleDataThisVersionRecordsWorkAndConsumptionItDoesNotAut",
            )}
          </p>
        </section>
        {jobsPanel(
          state.jobs.filter((job) => job.fieldId === id),
          t("workInThisField"),
        )}
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "inventory" && !id)
    content = (
      <>
        {back(t("myFarm"), "farm")}
        {pageHeading(
          t("aPlaceForEverything"),
          t("inventory"),
          t("physicalStockAndPlannedNeedsSideBySide"),
        )}
        <section className="panel">
          <div className="panel-heading">
            <h2>{t("materials")}</h2>
            <Package size={20} />
          </div>
          {state.stocks.map((stock) => {
            const { missing } = inventorySummary(rawState, stock.id);
            return (
              <button
                className="inventory-row"
                key={stock.id}
                onClick={() => go(`inventory/${stock.id}`)}
              >
                <span className="item-doodle">
                  <Package size={30} />
                </span>
                <span className="inventory-name">
                  <strong>{stock.name}</strong>
                  <small>
                    {
                      state.warehouses.find(
                        (item) => item.id === stock.warehouseId,
                      )?.name
                    }
                  </small>
                  <span
                    className={`stock-status ${missing !== null && missing > 0 ? "red-text" : ""}`}
                  >
                    {missing === null
                      ? t("unknownPlanning")
                      : missing > 0
                        ? t("amountShortForPlannedJobs", {
                            value0: kg(missing),
                          })
                        : t("plannedNeedsCovered")}
                  </span>
                </span>
                <span className="stock-amount">
                  <strong>{kg(stock.quantity)}</strong>
                  <small>{t("physicallyInStock")}</small>
                </span>
                <ChevronRight size={19} />
              </button>
            );
          })}
        </section>
        <h2 className="standalone-heading">{t("theStores")}</h2>
        <div className="warehouse-grid">
          {state.warehouses.map((store) => (
            <button
              key={store.id}
              className="panel warehouse-card"
              onClick={() => go(`warehouses/${store.id}`)}
            >
              <Warehouse size={32} />
              <h3>{store.name}</h3>
              <p>{store.description}</p>
              <span>
                {
                  state.stocks.filter((stock) => stock.warehouseId === store.id)
                    .length
                }{" "}
                {t("materialS")}
                <ArrowRight size={17} />
              </span>
            </button>
          ))}
        </div>
        {consumptionPanel()}
      </>
    );
  else if (section === "inventory" && id) {
    const stock = state.stocks.find((item) => item.id === id);
    const jobs = state.jobs.filter((job) => job.stockId === id);
    const { demand, missing } = inventorySummary(rawState, id);
    const need = demand.total;
    content = stock ? (
      <>
        {back(t("allInventory"), "inventory")}
        {pageHeading(
          t("materialRecord"),
          stock.name,
          t("fictionalMaterialNotARealProductOrLabel"),
        )}
        <div className="stock-metrics">
          <Metric
            label={t("physicallyInStock2")}
            value={kg(stock.quantity)}
            tone="green"
          />
          <Metric label={t("plannedUseRemaining")} value={kg(need)} />
          <Metric
            label={t("planningShortfall")}
            value={kg(missing)}
            tone={missing !== null && missing > 0 ? "red" : "green"}
          />
        </div>
        <div className="decision-entry-actions">
          <button
            className="button light"
            onClick={() => startChange("correctInventory", id)}
          >
            {t("correctStock")}
          </button>
        </div>
        <section className="panel detail-panel">
          <DetailRow label={t("storedIn")}>
            {resource(
              state.warehouses.find((item) => item.id === stock.warehouseId)!
                .name,
              `warehouses/${stock.warehouseId}`,
              <Warehouse size={16} />,
            )}
          </DetailRow>
          <DetailRow label={t("managedBy")}>
            {(() => {
              const managerId = state.warehouses.find(
                (location) => location.id === stock.warehouseId,
              )!.personId;
              return resource(
                state.people.find((person) => person.id === managerId)!.name,
                "team/" + managerId,
                <Users size={16} />,
              );
            })()}
          </DetailRow>
          <p className="fine-print">
            {t(
              "plansDoNotDeductPhysicalStockOnlyAnExplicitlyConfirmedConsumptionRecor",
            )}
          </p>
        </section>
        {jobsPanel(jobs, t("jobsUsingThisMaterial"))}
        {consumptionPanel(id)}
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "warehouses" && id) {
    const warehouse = state.warehouses.find((item) => item.id === id);
    const stocks = state.stocks.filter((stock) => stock.warehouseId === id);
    content = warehouse ? (
      <>
        {back(t("inventory"), "inventory")}
        {pageHeading(
          t("behindTheBarnDoor"),
          warehouse.name,
          warehouse.description,
        )}
        <section className="panel detail-panel">
          <DetailRow label={t("managedBy")}>
            {resource(
              state.people.find((item) => item.id === warehouse.personId)!.name,
              `team/${warehouse.personId}`,
            )}
          </DetailRow>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{t("storedHere")}</h2>
          </div>
          {stocks.length
            ? stocks.map((stock) => (
                <button
                  className="simple-row"
                  key={stock.id}
                  onClick={() => go(`inventory/${stock.id}`)}
                >
                  <Package size={23} />
                  <strong>{stock.name}</strong>
                  <span>{kg(stock.quantity)}</span>
                  <ChevronRight size={18} />
                </button>
              ))
            : empty(
                t("roomForSomethingUseful"),
                t("noMaterialsAreEnteredInThisDemoStoreYet"),
              )}
        </section>
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "machines" && !id)
    content = (
      <>
        {back(t("myFarm"), "farm")}
        {pageHeading(
          t("theHeavyLifters"),
          t("yourMachines"),
          t("fourTrustyCompanionsFollowEachOneToItsJobs"),
        )}
        <div className="machine-grid">
          {state.machines.map((machine) => (
            <button
              className="panel machine-card"
              key={machine.id}
              onClick={() => go(`machines/${machine.id}`)}
            >
              <div className={`machine-art ${machine.kind}`}>
                <Tractor size={62} strokeWidth={1.7} />
              </div>
              <h2>{machine.name}</h2>
              {machine.availability !== "available" && (
                <p className="red-text">
                  {assetStatusText(machine.availability)}
                </p>
              )}
              <p>
                {t("amountPlannedJobs", {
                  value0: state.jobs.filter(
                    (job) =>
                      job.machineIds.includes(machine.id) &&
                      job.status === "planned",
                  ).length,
                })}
              </p>
              <span className="text-button">
                {t("viewMachine")}
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      </>
    );
  else if (section === "machines" && id) {
    const machine = state.machines.find((item) => item.id === id);
    content = machine ? (
      <>
        {back(t("allMachines"), "machines")}
        {pageHeading(t("aTrustyFarmCompanion"), machine.name, machine.note)}
        <section className="panel detail-panel">
          <DetailRow label={t("equipmentType")}>
            {machine.kind === "tractor"
              ? t("tractor")
              : machine.kind === "spreader"
                ? t("fertilizerSpreader")
                : machine.kind === "seeder"
                  ? t("seedDrill")
                  : t("trailer")}
          </DetailRow>
          <DetailRow label={t("assetAvailability")}>
            {assetStatusText(machine.availability)}
          </DetailRow>
          <p>
            {t(
              "assignmentsAreRecordedByJobThisDemoDoesNotCheckBookingTimesOrMaintenan",
            )}
          </p>
        </section>
        <div className="decision-entry-actions">
          <button
            className="button red"
            onClick={() => startChange("setAssetAvailability", machine.id)}
          >
            <TriangleAlert size={18} />
            {t("reportBreakdown")}
          </button>
          <button
            className="button light"
            onClick={() => startChange("setAssetAvailability", machine.id)}
          >
            {t("changeStatus")}
          </button>
        </div>
        {machine.availability !== "available" && (
          <DecisionImpacts
            sourceLabel={t("currentValue")}
            state={state}
            go={go}
            draft={{
              id: `current-${machine.id}-${rawState.revision}`,
              farmId: rawState.farm.id,
              actorId: rawState.farm.demoUserId,
              kind: "setAssetAvailability",
              assetId: machine.id,
              availability: machine.availability,
            }}
            impacts={
              previewAction(rawState, {
                id: `current-${machine.id}-${rawState.revision}`,
                farmId: rawState.farm.id,
                actorId: rawState.farm.demoUserId,
                kind: "setAssetAvailability",
                assetId: machine.id,
                availability: machine.availability,
              }).impacts
            }
          />
        )}
        {jobsPanel(
          state.jobs.filter((job) => job.machineIds.includes(id)),
          t("assignedJobs"),
        )}
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "team" && !id)
    content = (
      <>
        {back(t("myFarm"), "farm")}
        {pageHeading(
          t("betterTogether"),
          t("theFarmCrew"),
          t("familiarFacesBehindEveryLittleBitOfProgress"),
        )}
        <div className="team-grid">
          {state.people.map((person) => (
            <button
              className="panel person-card"
              key={person.id}
              onClick={() => go(`team/${person.id}`)}
            >
              <span className={`avatar large-avatar ${person.color}`}>
                {person.initials}
              </span>
              <h2>{person.name}</h2>
              <p>{person.role}</p>
              <span className="text-button">
                {t("viewProfile")}
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
        <p className="fine-print">
          {t(
            "fictionalPeopleThisVersionHasOneDemoUserRealAccountsAndTeamPermissions",
          )}
        </p>
      </>
    );
  else if (section === "team" && id) {
    const person = state.people.find((item) => item.id === id);
    content = person ? (
      <>
        {back(t("theFarmCrew"), "team")}
        {pageHeading(
          t("meetTheCrew"),
          person.name,
          t("amountFictionalTeamMember", { value0: person.role }),
        )}
        <section className="panel detail-panel">
          <DetailRow label={t("role")}>{person.role}</DetailRow>
          <DetailRow label={t("personAvailability")}>
            {personStatusText(person.availability)}
          </DetailRow>
          <button
            className="button light full"
            onClick={() => startChange("setPersonAvailability", person.id)}
          >
            {t("changeStatus")}
          </button>
          {state.warehouses
            .filter((store) => store.personId === id)
            .map((store) => (
              <DetailRow key={store.id} label={t("looksAfter")}>
                {resource(store.name, `warehouses/${store.id}`)}
              </DetailRow>
            ))}
          <p className="fine-print">
            {t("aLinkedDemoProfileWithNoSeparateLoginOrAuthorization")}
          </p>
        </section>
        {jobsPanel(
          state.jobs.filter((job) => job.personId === id),
          t("assignedWork"),
        )}
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "products" && id) {
    const product =
      rawState.products.find((p) => p.id === id) ??
      documentProducts.find((p) => p.id === id);
    content = product ? (
      <>
        {back(t("inventory"), "inventory")}
        {pageHeading(t("productRecord"), product.name, t("fictionalDemoData"))}
        <section className="panel detail-panel">
          <DetailRow label={t("priceLabel")}>
            {product.unitPrice == null
              ? t("unknownStatus")
              : `${product.unitPrice} ${product.currency} / ${product.unit}`}
          </DetailRow>
          {state.stocks
            .filter((b) => b.productId === id)
            .map((b) => (
              <DetailRow key={b.id} label={t("stock")}>
                {resource(`${b.name} · ${kg(b.quantity)}`, `inventory/${b.id}`)}
              </DetailRow>
            ))}
          <SourceCards
            sections={documentSections.filter((s) => s.productId === id)}
          />
          <button className="button light" onClick={() => setModal("docs")}>
            {t("demoDocumentCatalog")}
          </button>
        </section>
        <DocumentQuestion key={id} state={rawState} productId={id} />
      </>
    ) : (
      <NotFound go={go} />
    );
  } else if (section === "services" && id) {
    const offer = rawState.serviceOffers?.find((o) => o.id === id);
    content = offer ? (
      <>
        {back(t("allJobs"), "jobs")}
        {pageHeading(t("serviceOffer"), offer.name, t("fictionalDemoData"))}
        <section className="panel detail-panel">
          <DetailRow label={t("job")}>
            {resource(
              state.jobs.find((j) => j.id === offer.taskId)?.title ??
                offer.taskId,
              `jobs/${offer.taskId}`,
            )}
          </DetailRow>
          <DetailRow label={t("priceLabel")}>
            {offer.price === null
              ? t("unknownStatus")
              : `${offer.price} ${offer.currency}`}
          </DetailRow>
          <DetailRow label={t("transportCost")}>
            {offer.transportCost === null
              ? t("unknownStatus")
              : `${offer.transportCost} ${offer.currency}`}
          </DetailRow>
          <DetailRow label={t("workDuration")}>
            {offer.durationHours ?? t("unknownStatus")}
          </DetailRow>
        </section>
      </>
    ) : (
      <NotFound go={go} />
    );
  } else content = <NotFound go={go} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("today")}
          aria-label={t("fieldnoteHome")}
        >
          <span className="brand-mark">
            <Sprout size={28} strokeWidth={2.6} />
          </span>
          fieldnote<span>.</span>
        </button>
        <div className="sidebar-farm">
          <span className="farm-initial">
            <Home size={20} />
          </span>
          <div>
            <strong>{t("muratSFarm")}</strong>
            <small>{t("aLittleDigitalHomestead")}</small>
          </div>
        </div>
        <span className="nav-caption">{t("yourEveryday")}</span>
        <Nav active={activeTab} go={go} />
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={22} />
            <strong>{t("yourFarmNotebook2")}</strong>
            <p>{t("workResourcesAndRecordsInOnePlace")}</p>
          </div>
          <button
            className="reset-link"
            onClick={() => {
              setModal("reset");
              setActionError("");
            }}
          >
            <RotateCcw size={15} />
            {t("resetDemoData")}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Sprout size={24} />
            fieldnote.
          </div>
          <div className="breadcrumb">
            {t("yourFarm")}
            <ChevronRight size={13} />
            <strong>
              {
                { today: t("today"), jobs: t("jobs"), farm: t("myFarm") }[
                  activeTab
                ]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <div
              className="language-switch"
              role="group"
              aria-label={t("languageSelector")}
            >
              <button
                className={language === "tr" ? "selected" : ""}
                aria-label="Türkçe"
                aria-pressed={language === "tr"}
                lang="tr"
                onClick={() => setLanguage("tr")}
              >
                TR
              </button>
              <button
                className={language === "en" ? "selected" : ""}
                aria-label="English"
                aria-pressed={language === "en"}
                lang="en"
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
            <span className="demo-badge">
              <span />
              {t("demoSampleData")}
            </span>
            <span className="header-user">
              <span className="avatar green small-avatar">MD</span>
              <span>
                Murat<small>{t("farmOwner")}</small>
              </span>
            </span>
          </div>
        </header>
        <main id="main-content">
          {storageError && (
            <div className="error-message storage-error" role="alert">
              {localizeMessage(storageError)}
              <button className="text-button" onClick={() => setModal("reset")}>
                {t("resetDemoData")}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {changeDraft && !showChange && (
            <div className="resume-draft">
              <span>
                <FileText size={17} />
                {t("youHaveAnUnconfirmedDraft")}
              </span>
              <button onClick={() => setShowChange(true)}>
                {t("continueReview")}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {draft && !showDraft && (
            <div className="resume-draft">
              <span>
                <FileText size={17} />
                {t("youHaveAnUnconfirmedDraft")}
              </span>
              <button
                onClick={() => {
                  setShowDraft(true);
                  setActionError("");
                }}
              >
                {t("continueReview")}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {content}
          <footer className="page-footer">
            <span>
              <span className="local-dot" />
              {t("savedOnThisBrowser")}
            </span>
            <span>{t("fictionalDemoNoRealAiOrAgronomicAdvice")}</span>
          </footer>
        </main>
      </div>
      <div className="mobile-navigation">
        <Nav active={activeTab} go={go} />
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={21} />
          <span>
            {t(
              toast.key,
              Object.fromEntries(
                Object.entries(toast.values).map(([key, value]) => [
                  key,
                  kg(value),
                ]),
              ),
            )}
          </span>
          <button
            aria-label={t("dismissNotification")}
            onClick={() => setToast(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {showChange && changeDraft && (
        <Dialog
          title={t("changePreview")}
          onClose={() => setShowChange(false)}
          wide
        >
          {aiMetadata && (
            <AIReviewNote
              metadata={aiMetadata}
              acknowledged={aiAcknowledged}
              onAcknowledge={setAIAcknowledged}
            />
          )}
          <ActionReview
            state={state}
            draft={changeDraft}
            setDraft={(next) => {
              setAIAcknowledged(false);
              setChangeDraft(next);
              setActionError("");
            }}
            go={go}
            error={actionError}
            busy={busy}
            confirmationBlocked={aiQuestionsPending}
            onCancel={() => {
              setChangeDraft(null);
              setShowChange(false);
            }}
            onConfirm={async () => {
              if (busy || aiQuestionsPending) return;
              setBusy(true);
              setActionError("");
              try {
                await confirmDraft(changeDraft, {
                  approved: true,
                  draftId: changeDraft.id,
                  expectedRevision: rawState.revision,
                });
                setChangeDraft(null);
                setShowChange(false);
                notify("changeSaved");
              } catch (error) {
                setActionError(
                  error instanceof Error ? error.message : t("saveFailed"),
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </Dialog>
      )}
      {showDraft && draft && (
        <Dialog
          title={t("aQuickCheckBeforeWeSave")}
          onClose={() => setShowDraft(false)}
          wide
        >
          {aiMetadata && (
            <AIReviewNote
              metadata={aiMetadata}
              acknowledged={aiAcknowledged}
              onAcknowledge={setAIAcknowledged}
            />
          )}
          <DraftReview
            state={state}
            draft={draft}
            setDraft={(next) => {
              setAIAcknowledged(false);
              setDraft(next);
              setActionError("");
            }}
            go={go}
            error={actionError}
            busy={busy}
            onConfirm={confirm}
            confirmationBlocked={aiQuestionsPending}
            onCancel={() => {
              setDraft(null);
              setShowDraft(false);
            }}
          />
        </Dialog>
      )}
      {modal === "plan" && (
        <Dialog title={t("plantAPlan")} onClose={() => setModal(null)}>
          <PlanForm
            state={state}
            go={go}
            busy={busy}
            error={actionError}
            onSubmit={async (plan, newId) => {
              setBusy(true);
              setActionError("");
              try {
                const action = planAction(rawState, plan, newId);
                await confirmDraft(action, {
                  approved: true,
                  draftId: action.id,
                  expectedRevision: rawState.revision,
                });
                setModal(null);
                notify("jobPlanned");
                go(`jobs/${newId}`);
              } catch (error) {
                setActionError(
                  error instanceof Error ? error.message : t("jobSaveFailed"),
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </Dialog>
      )}
      {modal === "docs" && (
        <Dialog
          title={t("aHomeForYourDocuments")}
          onClose={() => setModal(null)}
        >
          <p>{t("documentScope")}</p>
          <p className="fine-print">{t("syntheticDisclaimer")}</p>
          {documentProducts.map((product) => (
            <button
              key={product.id}
              className="button light full"
              onClick={() => go(`products/${product.id}`)}
            >
              {product.name}
              <ChevronRight size={18} />
            </button>
          ))}
          <SourceCards sections={documentSections} />
        </Dialog>
      )}
      {modal === "reset" && (
        <Dialog
          title={t("aFreshStartForTheFarm")}
          onClose={() => setModal(null)}
        >
          <p>
            {t(
              "thisResetsThisBrowserSDemoToTheOriginalFictionalFarm800KgOfDemoGubreAT",
            )}
          </p>
          <p>{t("yourNewJobsConfirmedRecordsAndOpenDraftWillBeRemoved")}</p>
          {actionError && (
            <div className="error-message" role="alert">
              {localizeMessage(actionError)}
            </div>
          )}
          <div className="dialog-actions">
            <button className="button light" onClick={() => setModal(null)}>
              {t("keepMyDemo")}
            </button>
            <button
              className="button red"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await reset();
                  setChangeDraft(null);
                  setShowChange(false);
                  setDraft(null);
                  setText("");
                  setInterpreterError("");
                  setShowDraft(false);
                  setModal(null);
                  go("today");
                  notify("demoRestored");
                } catch (error) {
                  setActionError(
                    error instanceof Error ? error.message : t("resetFailed"),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw size={16} />
              {t("resetDemoData")}
            </button>
          </div>
        </Dialog>
      )}
      {sowingId && (
        <Dialog
          title={t("recordSowingAsComplete")}
          onClose={() => setSowingId(null)}
        >
          <p>
            {t(
              "thePrerequisiteHasBeenCompletedThisWillMarkTheSowingJobComplete",
            )}
          </p>
          <div className="notice">
            <Sprout size={20} />
            <span>
              {t(
                "noSeedMaterialOrQuantityIsEnteredInThisDemoSoThisActionCreatesNoMateri",
              )}
            </span>
          </div>
          <ImpactPreview
            state={state}
            go={go}
            impacts={
              previewAction(rawState, sowingAction(rawState, sowingId)).impacts
            }
          />
          {actionError && (
            <div className="error-message" role="alert">
              {localizeMessage(actionError)}
            </div>
          )}
          <button
            className="button dark full"
            disabled={
              busy ||
              !previewAction(rawState, sowingAction(rawState, sowingId)).valid
            }
            onClick={async () => {
              setBusy(true);
              try {
                const action = sowingAction(rawState, sowingId);
                await confirmDraft(action, {
                  approved: true,
                  draftId: action.id,
                  expectedRevision: rawState.revision,
                });
                setSowingId(null);
                notify("sowingRecorded");
              } catch (error) {
                setActionError(
                  error instanceof Error ? error.message : t("saveFailed"),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("confirmCompletion")}
            <Check size={18} />
          </button>
        </Dialog>
      )}
    </div>
  );
}

function Nav({ active, go }: { active: string; go: (next: string) => void }) {
  return (
    <nav aria-label={t("mainNavigation")}>
      {[
        { id: "today", label: t("today"), icon: <Home size={21} /> },
        { id: "jobs", label: t("jobs"), icon: <ClipboardList size={21} /> },
        { id: "farm", label: t("myFarm"), icon: <Sprout size={22} /> },
      ].map((item) => (
        <button
          key={item.id}
          className={active === item.id ? "active" : ""}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => go(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
          {active === item.id && <span className="nav-active-dot" />}
        </button>
      ))}
    </nav>
  );
}
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function NotFound({ go }: { go: (next: string) => void }) {
  return (
    <div className="empty-state">
      <MapPin size={38} />
      <h1>{t("thisPathLeadsOffTheFarm")}</h1>
      <p>{t("thatDemoRecordCouldNotBeFoundItMayHaveBeenRemovedByAReset")}</p>
      <button className="button dark" onClick={() => go("today")}>
        {t("backToToday")}
        <ArrowRight size={17} />
      </button>
    </div>
  );
}

function JobsScreen({
  state,
  go,
  openPlan,
  jobCard,
  empty,
}: {
  state: FarmState;
  go: (next: string) => void;
  openPlan: () => void;
  jobCard: (job: Job) => ReactNode;
  empty: (title: string, subtitle: string) => ReactNode;
}) {
  const [filter, setFilter] = useState<"planned" | "completed">("planned");
  const jobs = state.jobs.filter((job) => job.status === filter);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("littleJobsRealProgress")}</span>
          <h1>{t("theJobList")}</h1>
          <p>{t("fromToDoToAllDoneKeepEveryDetailTogether")}</p>
        </div>
        <button className="button dark" onClick={openPlan}>
          <Plus size={18} />
          {t("planAJob")}
        </button>
      </div>
      <div className="filter-tabs" role="group" aria-label={t("filterJobs")}>
        {(["planned", "completed"] as const).map((tab) => (
          <button
            aria-pressed={filter === tab}
            key={tab}
            className={filter === tab ? "selected" : ""}
            onClick={() => setFilter(tab)}
          >
            {tab === "planned" ? (
              <Clock3 size={17} />
            ) : (
              <CheckCheck size={17} />
            )}
            {tab === "planned" ? t("planned2") : t("completed")}
            <span>{state.jobs.filter((job) => job.status === tab).length}</span>
          </button>
        ))}
      </div>
      <section className="panel">
        {jobs.length
          ? jobs.map(jobCard)
          : empty(
              t("nothingHereJustYet"),
              filter === "completed"
                ? t("confirmYourFirstJobAndItWillLandHere")
                : t("allCaughtUpAddANewPlanWhenYouReReady"),
            )}
      </section>
      <div className="notice">
        <Leaf size={21} />
        <div>
          <strong>{t("planningAheadLeavesYourStockRightWhereItIs")}</strong>
          <p>{t("inventoryChangesOnlyAfterYouReviewAndConfirmActualUse")}</p>
          <button className="text-button" onClick={() => go("inventory")}>
            {t("seeInventory")}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function DraftReview({
  state,
  draft,
  setDraft,
  go,
  error,
  busy,
  confirmationBlocked = false,
  onConfirm,
  onCancel,
}: {
  state: FarmState;
  draft: OperationDraft;
  setDraft: (draft: OperationDraft) => void;
  go: (route: string) => void;
  error: string;
  busy: boolean;
  confirmationBlocked?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const preview = previewOperation(state, draft);
  const availableJobs = state.jobs.filter(
    (job) =>
      job.status === "planned" &&
      job.type === "fertilizing" &&
      (!draft.fieldId || job.fieldId === draft.fieldId),
  );
  const updateField = (fieldId: string) => {
    const matches = state.jobs.filter(
      (job) =>
        job.fieldId === fieldId &&
        job.type === "fertilizing" &&
        job.status === "planned",
    );
    setDraft({
      ...draft,
      fieldId,
      jobId: matches.length === 1 ? matches[0].id : "",
      stockId: matches.length === 1 ? matches[0].stockId || "" : draft.stockId,
    });
  };
  return (
    <>
      <div className="review-status">
        <span className="pill yellow">{t("unconfirmedDraft")}</span>
        <span>{t("editableNothingSavedYet")}</span>
      </div>
      <p className="draft-intro">
        {t("makeSureThisMatchesWhatHappenedChooseAnyMissingDetailsBelow")}
      </p>
      <div className="form-grid">
        <label>
          {t("field")}
          <select
            value={draft.fieldId}
            onChange={(event) => updateField(event.target.value)}
          >
            <option value="">{t("chooseAField")}</option>
            {state.fields.map((field) => (
              <option value={field.id} key={field.id}>
                {t("amountAmountDecares", {
                  value0: field.name,
                  value1: field.area,
                })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("job")}
          <select
            value={draft.jobId}
            onChange={(event) => {
              const job = state.jobs.find(
                (job) => job.id === event.target.value,
              );
              setDraft({
                ...draft,
                jobId: job?.id || "",
                fieldId: job?.fieldId || draft.fieldId,
                stockId: job?.stockId || draft.stockId,
              });
            }}
          >
            <option value="">{t("chooseAPlannedJob")}</option>
            {availableJobs.map((job) => (
              <option value={job.id} key={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("material")}
          <select
            value={draft.stockId}
            onChange={(event) =>
              setDraft({ ...draft, stockId: event.target.value })
            }
          >
            <option value="">{t("chooseAMaterial")}</option>
            {state.stocks.map((stock) => (
              <option value={stock.id} key={stock.id}>
                {stock.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("actualAmountUsed")}
          <div className="input-unit">
            <input
              inputMode="decimal"
              value={draft.quantity}
              onChange={(event) =>
                setDraft({ ...draft, quantity: event.target.value })
              }
              placeholder={t("enterAmount")}
              aria-label={t("actualAmountUsed")}
            />
            <span>kg</span>
          </div>
        </label>
      </div>
      {availableJobs.length === 0 && (
        <div className="notice">
          <ClipboardList size={20} />
          <span>
            {t(
              "noPlannedFertilizingJobMatchesThisFieldAnAlreadyCompletedJobCannotCons",
            )}
          </span>
        </div>
      )}
      {preview.stock && (
        <section className="stock-preview" aria-label={t("stockPreview")}>
          <div className="preview-heading">
            <Package size={18} />
            <strong>{t("hereSWhatWillChange")}</strong>
          </div>
          <div className="stock-equation">
            <div>
              <small>{t("inStockNow")}</small>
              <strong>{kg(preview.stock.quantity)}</strong>
            </div>
            <ArrowRight size={24} />
            <div>
              <small>{t("afterThisEntry")}</small>
              <strong
                className={
                  preview.after !== null && preview.after < 0 ? "red-text" : ""
                }
              >
                {preview.after !== null ? kg(preview.after) : "— kg"}
              </strong>
            </div>
          </div>
          <p>
            {preview.after !== null && preview.after < 0
              ? t("thisExceedsAvailableStockNothingCanBeSaved")
              : preview.quantity !== null
                ? t("amountProposedUseSubjectToConfirmation", {
                    value0: kg(preview.quantity),
                  })
                : t("addTheActualAmountToCalculateTheChange")}
          </p>
        </section>
      )}
      {preview.shortages.map((shortage) => (
        <div key={shortage.stockId} className="review-warning">
          <TriangleAlert size={23} />
          <div>
            <strong>
              {t("amountShortForRemainingWork", {
                value0: kg(shortage.missing),
              })}
            </strong>
            <p>
              {t("amountAmountNeededAmountRemaining", {
                value0: shortage.jobIds
                  .map((id) => state.jobs.find((job) => job.id === id)!.title)
                  .join(" + "),
                value1: kg(shortage.required),
                value2: kg(shortage.available),
              })}
            </p>
            {shortage.isMinimum && <p>{t("unknownPlanning")}</p>}
            {shortage.jobIds.map((id) => (
              <button
                key={id}
                className="resource-link"
                onClick={() => go(`jobs/${id}`)}
              >
                {t("open")} {state.jobs.find((job) => job.id === id)!.title}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <ImpactPreview
        state={state}
        go={go}
        draft={preview.actionDraft}
        impacts={preview.impacts}
      />
      <div className="source-links">
        <span>{t("linkedRecords")}</span>
        {draft.jobId && (
          <button onClick={() => go(`jobs/${draft.jobId}`)}>
            <ClipboardList size={14} />
            {t("job")}
            <ArrowUpRight size={13} />
          </button>
        )}
        {draft.stockId && (
          <button onClick={() => go(`inventory/${draft.stockId}`)}>
            <Package size={14} />
            {t("stock")}
            <ArrowUpRight size={13} />
          </button>
        )}
        {draft.fieldId && (
          <button onClick={() => go(`fields/${draft.fieldId}`)}>
            <MapPin size={14} />
            {t("field")}
            <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {preview.errors.length > 0 && (
        <div className="validation-message" role="status">
          {preview.errors.map((message) => (
            <p key={message}>{localizeMessage(message)}</p>
          ))}
        </div>
      )}
      {error && (
        <div className="error-message" role="alert">
          {localizeMessage(error)}
        </div>
      )}
      <p className="fine-print">
        {t(
          "fictionalWorkQuantitiesNotAgriculturalDoseRecommendationsConfirmingCom",
        )}
      </p>
      <div className="dialog-actions">
        <button className="button light" onClick={onCancel}>
          {t("cancelDraft")}
        </button>
        <button
          className="button dark"
          disabled={!preview.valid || busy || confirmationBlocked}
          onClick={onConfirm}
        >
          <Check size={18} />
          {busy ? t("saving") : t("confirmSave")}
        </button>
      </div>
    </>
  );
}

function PlanForm({
  state,
  go,
  onSubmit,
  busy,
  error,
}: {
  state: FarmState;
  go: (route: string) => void;
  onSubmit: (draft: PlanDraft, taskId: string) => void;
  busy: boolean;
  error: string;
}) {
  const [taskId] = useState(createId);
  const [reviewing, setReviewing] = useState(false);
  const [plan, setPlan] = useState<PlanDraft>({
    title: "",
    fieldId: "",
    personId: "",
    machineIds: [],
    stockId: "",
    quantity: "",
    dependencyId: "",
  });
  const change = (key: keyof PlanDraft, value: string) => {
    setReviewing(false);
    setPlan({ ...plan, [key]: value });
  };
  const action = planAction(state.domain, plan, taskId);
  const preview = previewAction(state.domain, action);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!reviewing) setReviewing(true);
        else if (preview.valid) onSubmit(plan, taskId);
      }}
    >
      <p>
        {t(
          "planAFertilizingJobUsingThisFarmSExistingResourcesPhysicalStockStaysUn",
        )}
      </p>
      <div className="form-grid">
        <label className="span-two">
          {t("jobName")}
          <input
            required
            maxLength={80}
            placeholder={t("eGFertilizeGuney")}
            value={plan.title}
            onChange={(event) => change("title", event.target.value)}
          />
        </label>
        <label>
          {t("field")}
          <select
            required
            value={plan.fieldId}
            onChange={(event) => change("fieldId", event.target.value)}
          >
            <option value="">{t("chooseField")}</option>
            {state.fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("assignTo")}
          <select
            required
            value={plan.personId}
            onChange={(event) => change("personId", event.target.value)}
          >
            <option value="">{t("choosePerson")}</option>
            {state.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("material")}
          <select
            required
            value={plan.stockId}
            onChange={(event) => change("stockId", event.target.value)}
          >
            <option value="">{t("chooseMaterial")}</option>
            {state.stocks.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stock.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("plannedAmountKg")}
          <input
            required
            inputMode="decimal"
            placeholder={t("eG100")}
            value={plan.quantity}
            onChange={(event) => change("quantity", event.target.value)}
          />
        </label>
        <fieldset className="span-two">
          <legend>{t("machinesChooseAtLeastOne")}</legend>
          <div className="machine-options">
            {state.machines.map((machine) => (
              <label key={machine.id}>
                <input
                  type="checkbox"
                  checked={plan.machineIds.includes(machine.id)}
                  onChange={(event) => {
                    setReviewing(false);
                    setPlan({
                      ...plan,
                      machineIds: event.target.checked
                        ? [...plan.machineIds, machine.id]
                        : plan.machineIds.filter((id) => id !== machine.id),
                    });
                  }}
                />
                {machine.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="span-two">
          {t("prerequisiteOptional")}
          <select
            value={plan.dependencyId}
            onChange={(event) => change("dependencyId", event.target.value)}
          >
            <option value="">{t("noPrerequisite")}</option>
            {state.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {reviewing && (
        <section className="plan-review">
          <strong>{t("planPreview")}</strong>
          <ImpactPreview
            state={state}
            go={go}
            draft={action}
            impacts={preview.impacts}
            expanded
          />
          {preview.issues.map((issue) => (
            <p className="validation-message" key={issue.field + issue.message}>
              {localizeMessage(issue.message)}
            </p>
          ))}
        </section>
      )}
      {error && (
        <div className="error-message" role="alert">
          {localizeMessage(error)}
        </div>
      )}
      <p className="fine-print">
        {t(
          "amountsDescribeFictionalPlansOnlyTheyAreNotAgriculturalRecommendations",
        )}
      </p>
      <button
        className="button dark full"
        type="submit"
        disabled={busy || (reviewing && !preview.valid)}
      >
        <Plus size={18} />
        {busy ? t("saving") : reviewing ? t("confirmSave") : t("reviewPlan")}
      </button>
    </form>
  );
}

const ImpactPreview = DecisionImpacts;

function CategoryIcon({ type }: { type: Category }) {
  const icons = {
    fields: <Sprout size={28} />,
    inventory: <Warehouse size={28} />,
    machines: <Tractor size={28} />,
    team: <Users size={28} />,
  };
  return <span className={`category-icon ${type}`}>{icons[type]}</span>;
}
