import { verifyChunk, verifySingle } from "./api.js";
import { processBrowserBatch } from "./batch.js";
import { MOCK_SUBMISSIONS } from "./mock-submissions.js";
import type {
  AgentDecision,
  DecidedItem,
  FieldCheck,
  QueueItem,
  SubmittedApplication,
  VerificationOutcome,
  WarningCheck,
} from "./types.js";

const LOW_CONFIDENCE_THRESHOLD = 0.85;

const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand name",
  classType: "Class or type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  producerNameAddress: "Producer name and address",
  countryOfOrigin: "Country of origin",
};

const WARNING_LABELS: Record<string, string> = {
  text: "Required warning text",
  headingUppercase: "Heading is uppercase",
  headingBold: "Heading is bold",
  bodyNotBold: "Body is not bold",
  separateFromOtherText: "Separate from other text",
  continuousParagraph: "Continuous paragraph",
};

const STATUS_LABELS: Record<string, string> = {
  MATCH: "Match",
  MISMATCH: "Mismatch",
  NOT_FOUND: "Not found",
  NOT_APPLICABLE: "Not applicable",
  UNCERTAIN: "Uncertain",
};

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing required element: ${selector}`);
  return value;
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function valueText(value: string | boolean | null): string {
  if (value === null) return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function statusClass(outcome: VerificationOutcome["outcome"]): string {
  if (outcome === "MATCH") return "outcome-match";
  if (outcome === "NEEDS_REVIEW") return "outcome-review";
  return "outcome-unable";
}

function outcomeLabel(outcome: VerificationOutcome["outcome"]): string {
  if (outcome === "MATCH") return "Match";
  if (outcome === "NEEDS_REVIEW") return "Needs review";
  return "Unable to verify";
}

function appendDefinition(list: HTMLDListElement, term: string, value: string): void {
  list.append(create("dt", undefined, term), create("dd", undefined, value));
}

function confidenceText(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function confidenceBadge(confidence: number): HTMLSpanElement | null {
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
  return create("span", "low-confidence", "Low confidence");
}

function needsReviewStatus(status: FieldCheck["status"] | WarningCheck["status"]): boolean {
  return status === "MISMATCH" || status === "NOT_FOUND" || status === "UNCERTAIN";
}

function appendCheckGroup(target: ParentNode, heading: string, cards: HTMLLIElement[]): void {
  if (!cards.length) return;
  const list = create("ul", "check-list");
  list.append(...cards);
  target.append(create("h3", undefined, heading), list);
}

function fieldCard(field: FieldCheck): HTMLLIElement {
  const item = create("li", "check-card");
  item.dataset.status = field.status;
  const heading = create(
    "strong",
    undefined,
    `${FIELD_LABELS[field.field] ?? field.field}: ${STATUS_LABELS[field.status] ?? field.status}`,
  );
  const badge = confidenceBadge(field.confidence);
  if (badge) heading.append(" ", badge);
  const values = create("dl");
  appendDefinition(values, "Submitted", field.expected ?? "Not applicable");
  appendDefinition(values, "Extracted", field.observed ?? "Not found");
  appendDefinition(values, "Extraction confidence", confidenceText(field.confidence));
  if (field.score !== null) appendDefinition(values, "Similarity", `${Math.round(field.score * 100)}%`);
  appendDefinition(values, "Reason", field.detail);
  item.append(heading, values);
  return item;
}

function warningCard(check: WarningCheck): HTMLLIElement {
  const item = create("li", "check-card");
  item.dataset.status = check.status;
  const heading = create(
    "strong",
    undefined,
    `${WARNING_LABELS[check.check] ?? check.check}: ${STATUS_LABELS[check.status] ?? check.status}`,
  );
  const badge = confidenceBadge(check.confidence);
  if (badge) heading.append(" ", badge);
  const values = create("dl");
  appendDefinition(values, "Extracted", valueText(check.observed));
  appendDefinition(values, "Extraction confidence", confidenceText(check.confidence));
  appendDefinition(values, "Reason", check.detail);
  item.append(heading, values);
  return item;
}

export function renderOutcome(
  outcome: VerificationOutcome,
  target: HTMLElement,
  options: { headingLevel?: 2 | 3; showHeader?: boolean } = {},
): void {
  target.replaceChildren();
  const headingLevel = options.headingLevel ?? 2;
  if (options.showHeader !== false) {
    const header = create("div", "result-header");
    const heading = headingLevel === 2
      ? create("h2", undefined, outcome.referenceId)
      : create("h3", undefined, outcome.referenceId);
    header.append(
      heading,
      create("span", `outcome-badge ${statusClass(outcome.outcome)}`, outcomeLabel(outcome.outcome)),
    );
    target.append(header);
  }
  target.append(create("p", "result-meta", `${outcome.filename} · ${Math.round(outcome.processingMs)} ms`));
  if (outcome.outcome === "UNABLE_TO_VERIFY") {
    target.append(
      create("p", undefined, outcome.error.message),
      create("p", "result-meta", `Error code: ${outcome.error.code}`),
    );
    return;
  }

  const fieldIssues = outcome.fields.filter((field) => needsReviewStatus(field.status));
  const fieldMatches = outcome.fields.filter((field) => !needsReviewStatus(field.status));
  const warningIssues = outcome.warningChecks.filter((check) => needsReviewStatus(check.status));
  const warningMatches = outcome.warningChecks.filter((check) => !needsReviewStatus(check.status));

  appendCheckGroup(target, "Submitted value comparisons that need review", fieldIssues.map(fieldCard));
  appendCheckGroup(target, "Government warning checks that need review", warningIssues.map(warningCard));

  const matchCount = fieldMatches.length + warningMatches.length;
  if (!matchCount) return;

  const matched = create("details", "matched-checks");
  const label = matchCount === 1 ? "1 check matched" : `${matchCount} checks matched`;
  matched.append(create("summary", undefined, label));
  appendCheckGroup(matched, "Submitted value comparisons", fieldMatches.map(fieldCard));
  appendCheckGroup(matched, "Government warning checks", warningMatches.map(warningCard));
  target.append(matched);
}

function applicationDetails(submission: SubmittedApplication): HTMLDListElement {
  const details = create("dl", "application-values");
  appendDefinition(details, "Brand name", submission.application.brandName);
  appendDefinition(details, "Class or type", submission.application.classType);
  appendDefinition(details, "Alcohol content", submission.application.alcoholContent);
  appendDefinition(details, "Net contents", submission.application.netContents);
  appendDefinition(details, "Producer name and address", submission.application.producerNameAddress);
  appendDefinition(details, "Country of origin", submission.application.countryOfOrigin ?? "Not supplied");
  return details;
}

function queueState(outcome: VerificationOutcome | undefined, running: boolean): string {
  if (running) return "Analyzing";
  return outcome ? outcomeLabel(outcome.outcome) : "Ready for review";
}

function decisionLabel(decision: AgentDecision): string {
  return decision === "APPROVED" ? "Approved" : "Denied";
}

function decisionClass(decision: AgentDecision): string {
  return decision === "APPROVED" ? "outcome-approved" : "outcome-denied";
}

function copySubmission(submission: SubmittedApplication): QueueItem {
  return {
    title: submission.title,
    imageFilename: submission.imageFilename,
    imageUrl: submission.imageUrl,
    application: { ...submission.application },
  };
}

function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

function setDialogError(target: HTMLElement, message: string | null): void {
  if (!message) {
    target.hidden = true;
    target.textContent = "";
    return;
  }
  target.hidden = false;
  target.textContent = message;
}

async function imageFor(item: QueueItem, signal: AbortSignal): Promise<File> {
  if (item.image) return item.image;
  const response = await fetch(item.imageUrl, { signal });
  if (!response.ok) throw new Error(`Could not load ${item.imageFilename} for review.`);
  const blob = await response.blob();
  const image = new File([blob], item.imageFilename, { type: blob.type || "image/png" });
  item.image = image;
  return image;
}

export function initializeApp(root: Document = document): void {
  if (root.documentElement.dataset.labelReviewInitialized === "true") return;
  root.documentElement.dataset.labelReviewInitialized = "true";

  const errorSummary = required<HTMLElement>(root, "#error-summary");
  const loadDemo = required<HTMLButtonElement>(root, "#load-demo");
  const addApplication = required<HTMLButtonElement>(root, "#add-application");
  const processSelected = required<HTMLButtonElement>(root, "#process-selected");
  const processBatchButton = required<HTMLButtonElement>(root, "#process-batch");
  const status = required<HTMLElement>(root, "#demo-status");
  const progressWrap = required<HTMLElement>(root, "#demo-progress-wrap");
  const progress = required<HTMLProgressElement>(root, "#demo-progress");
  const queueList = required<HTMLElement>(root, "#application-queue");
  const queueEmpty = required<HTMLElement>(root, "#queue-empty");
  const decisionList = required<HTMLElement>(root, "#decision-list");
  const decisionEmpty = required<HTMLElement>(root, "#decision-empty");
  const decisionCounts = required<HTMLElement>(root, "#decision-counts");
  const detail = required<HTMLElement>(root, "#application-detail");
  const batchDialog = required<HTMLDialogElement>(root, "#batch-dialog");
  const batchForm = required<HTMLFormElement>(root, "#batch-form");
  const batchCustomCount = required<HTMLInputElement>(root, "#batch-custom-count");
  const batchDialogError = required<HTMLElement>(root, "#batch-dialog-error");
  const batchCancel = required<HTMLButtonElement>(root, "#batch-cancel");
  const addDialog = required<HTMLDialogElement>(root, "#add-application-dialog");
  const addForm = required<HTMLFormElement>(root, "#add-application-form");
  const addImage = required<HTMLInputElement>(root, "#application-image");
  const addDialogError = required<HTMLElement>(root, "#add-application-error");
  const addCancel = required<HTMLButtonElement>(root, "#add-application-cancel");

  const queue: QueueItem[] = [];
  const decided: DecidedItem[] = [];
  let selectedReference: string | null = null;
  const outcomes = new Map<string, VerificationOutcome>();
  const processingIds = new Set<string>();

  function clearErrors(): void {
    errorSummary.hidden = true;
    errorSummary.replaceChildren();
  }

  function showError(message: string): void {
    errorSummary.replaceChildren(
      create("strong", undefined, "The applications could not be reviewed."),
      create("p", undefined, message),
    );
    errorSummary.hidden = false;
    errorSummary.focus();
  }

  function unprocessedItems(): QueueItem[] {
    return queue.filter((item) => (
      !outcomes.has(item.application.referenceId) && !processingIds.has(item.application.referenceId)
    ));
  }

  function knownReference(referenceId: string): boolean {
    return queue.some((item) => item.application.referenceId === referenceId)
      || decided.some((item) => item.application.referenceId === referenceId);
  }

  function selectedQueued(): QueueItem | undefined {
    return selectedReference
      ? queue.find((item) => item.application.referenceId === selectedReference)
      : undefined;
  }

  function selectedDecided(): DecidedItem | undefined {
    return selectedReference
      ? decided.find((item) => item.application.referenceId === selectedReference)
      : undefined;
  }

  function updateActions(): void {
    const busy = processingIds.size > 0;
    processSelected.disabled = !selectedQueued() || busy;
    processBatchButton.disabled = busy || unprocessedItems().length === 0;
  }

  function submissionButton(
    submission: QueueItem,
    stateText: string,
    stateClassName: string,
    onSelect: () => void,
  ): HTMLLIElement {
    const referenceId = submission.application.referenceId;
    const item = create("li", "queue-item");
    const button = create("button", "queue-button");
    button.type = "button";
    button.setAttribute("aria-current", String(referenceId === selectedReference));
    const image = create("img", "queue-thumbnail") as HTMLImageElement;
    image.src = submission.imageUrl;
    image.alt = "";
    const text = create("span", "queue-copy");
    text.append(
      create("strong", undefined, referenceId),
      create("span", undefined, submission.title),
    );
    const state = create("span", `queue-state ${stateClassName}`, stateText);
    button.append(image, text, state);
    button.addEventListener("click", onSelect);
    item.append(button);
    return item;
  }

  function renderQueue(): void {
    queueEmpty.hidden = queue.length > 0;
    queueList.replaceChildren();
    queue.forEach((submission) => {
      const referenceId = submission.application.referenceId;
      const outcome = outcomes.get(referenceId);
      const running = processingIds.has(referenceId);
      queueList.append(submissionButton(
        submission,
        queueState(outcome, running),
        outcome && !running ? statusClass(outcome.outcome) : "",
        () => {
          selectedReference = referenceId;
          render();
        },
      ));
    });
  }

  function renderDecisions(): void {
    const approved = decided.filter((item) => item.decision === "APPROVED").length;
    const denied = decided.length - approved;
    decisionCounts.textContent = `Approved ${approved} · Denied ${denied}`;
    decisionEmpty.hidden = decided.length > 0;
    decisionList.replaceChildren();
    decided.forEach((submission) => {
      const referenceId = submission.application.referenceId;
      decisionList.append(submissionButton(
        submission,
        decisionLabel(submission.decision),
        decisionClass(submission.decision),
        () => {
          selectedReference = referenceId;
          render();
        },
      ));
    });
  }

  function appendApplicationOverview(target: HTMLElement, submission: QueueItem): void {
    const submitted = create("section", "submitted-panel");
    submitted.append(create("h3", undefined, "Submitted application values"), applicationDetails(submission));
    const labelPanel = create("section", "label-panel");
    labelPanel.append(create("h3", undefined, "Submitted label image"));
    const label = create("img", "label-image") as HTMLImageElement;
    label.src = submission.imageUrl;
    label.alt = `Submitted label for ${submission.application.referenceId}`;
    labelPanel.append(label);
    const overview = create("div", "application-overview");
    overview.append(submitted, labelPanel);
    target.append(overview);
  }

  function appendVerification(target: HTMLElement, referenceId: string, running: boolean): void {
    const result = create("section", "verification-result");
    const outcome = outcomes.get(referenceId);
    if (running) {
      result.append(
        create("h3", undefined, "Automated review in progress"),
        create("p", undefined, "The submitted label is being read and compared with the submitted application values."),
      );
    } else if (outcome) {
      renderOutcome(outcome, result, { headingLevel: 3, showHeader: false });
    } else {
      result.append(
        create("h3", undefined, "Ready for automated review"),
        create("p", undefined, "Process this application or a batch of unprocessed items to extract label information and compare it with the submitted values."),
      );
    }
    target.append(result);
  }

  function appendDecisionActions(target: HTMLElement, referenceId: string): void {
    const panel = create("section", "decision-actions");
    panel.append(
      create("h3", undefined, "Agent decision"),
      create("p", undefined, "Approve or deny this application after reviewing the automated result. The decision stays in this tab only."),
    );
    const buttons = create("div", "decision-buttons");
    const approve = create("button", "primary-action", "Approve");
    approve.type = "button";
    approve.id = "approve-application";
    approve.addEventListener("click", () => recordDecision(referenceId, "APPROVED"));
    const deny = create("button", "danger-action", "Deny");
    deny.type = "button";
    deny.id = "deny-application";
    deny.addEventListener("click", () => recordDecision(referenceId, "DENIED"));
    buttons.append(approve, deny);
    panel.append(buttons);
    target.append(panel);
  }

  function renderDetail(): void {
    detail.replaceChildren();
    const queued = selectedQueued();
    const completed = selectedDecided();
    const submission = queued ?? completed;
    if (!submission) {
      detail.append(
        create("p", "step", "Submitted application"),
        create("h2", undefined, "No application selected"),
        create("p", undefined, "Load demo samples or add an application to start a review."),
      );
      return;
    }

    const referenceId = submission.application.referenceId;
    const outcome = outcomes.get(referenceId);
    const running = processingIds.has(referenceId);
    const header = create("div", "detail-header");
    const headingGroup = create("div");
    headingGroup.append(
      create("p", "step", "Submitted application"),
      create("h2", undefined, referenceId),
      create("p", "detail-title", submission.title),
    );
    header.append(headingGroup);
    const badges = create("div", "detail-badges");
    if (completed) {
      badges.append(create("span", `outcome-badge ${decisionClass(completed.decision)}`, decisionLabel(completed.decision)));
    }
    if (outcome && !running) {
      badges.append(create("span", `outcome-badge ${statusClass(outcome.outcome)}`, outcomeLabel(outcome.outcome)));
    }
    if (badges.childElementCount) header.append(badges);
    detail.append(header);
    const body = create("div", "detail-body");
    appendApplicationOverview(body, submission);
    appendVerification(body, referenceId, running);
    detail.append(body);
    if (queued && outcome && !running) appendDecisionActions(detail, referenceId);
  }

  function recordDecision(referenceId: string, decision: AgentDecision): void {
    const index = queue.findIndex((item) => item.application.referenceId === referenceId);
    if (index < 0 || !outcomes.has(referenceId) || processingIds.has(referenceId)) return;
    const [item] = queue.splice(index, 1);
    if (!item) return;
    decided.push({ ...item, decision });
    selectedReference = queue[index]?.application.referenceId
      ?? queue[index - 1]?.application.referenceId
      ?? null;
    progressWrap.hidden = false;
    status.textContent = `${decisionLabel(decision)} ${referenceId}.`;
    render();
  }

  function render(): void {
    renderQueue();
    renderDecisions();
    renderDetail();
    updateActions();
  }

  function startProgress(total: number, message: string): void {
    progressWrap.hidden = false;
    progress.hidden = false;
    progress.max = Math.max(total, 1);
    if (total === 0) progress.removeAttribute("value");
    else progress.value = 0;
    status.textContent = message;
  }

  loadDemo.addEventListener("click", () => {
    const existing = new Set([
      ...queue.map((item) => item.application.referenceId),
      ...decided.map((item) => item.application.referenceId),
    ]);
    const added = MOCK_SUBMISSIONS.filter((item) => !existing.has(item.application.referenceId)).map(copySubmission);
    queue.push(...added);
    if (!selectedReference && queue.length) selectedReference = queue[0]!.application.referenceId;
    render();
  });

  addApplication.addEventListener("click", () => {
    setDialogError(addDialogError, null);
    openDialog(addDialog);
  });

  addCancel.addEventListener("click", () => closeDialog(addDialog));

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(addForm);
    const referenceId = String(data.get("referenceId") ?? "").trim();
    const brandName = String(data.get("brandName") ?? "").trim();
    const classType = String(data.get("classType") ?? "").trim();
    const alcoholContent = String(data.get("alcoholContent") ?? "").trim();
    const netContents = String(data.get("netContents") ?? "").trim();
    const producerNameAddress = String(data.get("producerNameAddress") ?? "").trim();
    const countryOfOrigin = String(data.get("countryOfOrigin") ?? "").trim();
    const imageFile = addImage.files?.[0];

    if (!referenceId || !brandName || !classType || !alcoholContent || !netContents || !producerNameAddress) {
      setDialogError(addDialogError, "Enter every required application value.");
      return;
    }
    if (knownReference(referenceId)) {
      setDialogError(addDialogError, "An application with this reference ID is already in the queue or decisions summary.");
      return;
    }
    if (!(imageFile instanceof File) || !imageFile.size) {
      setDialogError(addDialogError, "Attach a label image.");
      return;
    }

    const item: QueueItem = {
      title: brandName,
      imageFilename: imageFile.name,
      imageUrl: URL.createObjectURL(imageFile),
      image: imageFile,
      application: {
        referenceId,
        brandName,
        classType,
        alcoholContent,
        netContents,
        producerNameAddress,
        ...(countryOfOrigin ? { countryOfOrigin } : {}),
      },
    };
    queue.push(item);
    selectedReference = referenceId;
    addForm.reset();
    setDialogError(addDialogError, null);
    closeDialog(addDialog);
    render();
  });

  processSelected.addEventListener("click", async () => {
    const submission = queue.find((item) => item.application.referenceId === selectedReference);
    if (!submission || processingIds.size > 0) return;
    const referenceId = submission.application.referenceId;
    clearErrors();
    processingIds.add(referenceId);
    startProgress(1, `Analyzing ${referenceId}. This usually takes less than five seconds per label.`);
    render();
    try {
      const image = await imageFor(submission, new AbortController().signal);
      const outcome = await verifySingle(submission.application, image);
      outcomes.set(referenceId, outcome);
      progress.value = 1;
      status.textContent = `Finished reviewing ${referenceId}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The submitted application could not be reviewed.";
      status.textContent = "The review did not finish.";
      showError(message);
    } finally {
      processingIds.delete(referenceId);
      render();
    }
  });

  async function runBatch(count: number): Promise<void> {
    const items = unprocessedItems().slice(0, count);
    if (!items.length) {
      progressWrap.hidden = false;
      status.textContent = "There are no unprocessed applications in the queue.";
      return;
    }
    clearErrors();
    items.forEach((item) => processingIds.add(item.application.referenceId));
    startProgress(items.length, `Preparing ${items.length} submitted applications for review.`);
    render();
    try {
      const controller = new AbortController();
      const entries = await Promise.all(items.map(async (item) => ({
        application: item.application,
        image: await imageFor(item, controller.signal),
      })));
      status.textContent = `Analyzing ${entries.length} submitted label images. This usually takes less than five seconds per label.`;
      const results = await processBrowserBatch(entries, verifyChunk, {
        signal: controller.signal,
        onProgress: ({ completed, total }) => {
          progress.value = completed;
          status.textContent = `Analyzing ${completed} of ${total} submitted label images.`;
        },
      });
      results.forEach((outcome) => {
        if (outcome) outcomes.set(outcome.referenceId, outcome);
      });
      progress.value = items.length;
      status.textContent = `Finished reviewing ${items.length} submitted applications.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The submitted applications could not be reviewed.";
      status.textContent = "The review did not finish.";
      showError(message);
    } finally {
      items.forEach((item) => processingIds.delete(item.application.referenceId));
      render();
    }
  }

  processBatchButton.addEventListener("click", () => {
    setDialogError(batchDialogError, null);
    batchCustomCount.value = "";
    openDialog(batchDialog);
  });

  batchCancel.addEventListener("click", () => closeDialog(batchDialog));

  batchForm.querySelectorAll<HTMLButtonElement>("[data-batch-count]").forEach((button) => {
    button.addEventListener("click", () => {
      const count = Number(button.dataset.batchCount);
      closeDialog(batchDialog);
      void runBatch(count);
    });
  });

  batchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const count = Number(batchCustomCount.value);
    if (!Number.isInteger(count) || count < 1) {
      setDialogError(batchDialogError, "Enter a whole number of 1 or more.");
      return;
    }
    closeDialog(batchDialog);
    void runBatch(count);
  });

  render();
}

const boot = () => {
  if (document.querySelector("#load-demo")) initializeApp();
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
