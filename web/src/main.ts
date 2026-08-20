import { verifyChunk } from "./api.js";
import { MOCK_SUBMISSIONS } from "./mock-submissions.js";
import type {
  FieldCheck,
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

  target.append(create("h3", undefined, "Submitted value comparisons"));
  const fields = create("ul", "check-list");
  outcome.fields.forEach((field) => fields.append(fieldCard(field)));
  target.append(fields, create("h3", undefined, "Government warning checks"));
  const warnings = create("ul", "check-list");
  outcome.warningChecks.forEach((check) => warnings.append(warningCard(check)));
  target.append(warnings);
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

async function loadDemoEntries(signal: AbortSignal) {
  return Promise.all(MOCK_SUBMISSIONS.map(async (submission) => {
    const response = await fetch(submission.imageUrl, { signal });
    if (!response.ok) throw new Error(`Could not load ${submission.imageFilename} for the demo.`);
    const image = await response.blob();
    return {
      application: submission.application,
      image: new File([image], submission.imageFilename, { type: image.type || "image/png" }),
    };
  }));
}

export function initializeApp(root: Document = document): void {
  if (root.documentElement.dataset.labelReviewInitialized === "true") return;
  root.documentElement.dataset.labelReviewInitialized = "true";

  const errorSummary = required<HTMLElement>(root, "#error-summary");
  const runDemo = required<HTMLButtonElement>(root, "#run-demo");
  const status = required<HTMLElement>(root, "#demo-status");
  const progressWrap = required<HTMLElement>(root, "#demo-progress-wrap");
  const progress = required<HTMLProgressElement>(root, "#demo-progress");
  const queue = required<HTMLElement>(root, "#application-queue");
  const detail = required<HTMLElement>(root, "#application-detail");

  let selectedReference = MOCK_SUBMISSIONS[0]!.application.referenceId;
  let outcomes = new Map<string, VerificationOutcome>();
  let running = false;

  function clearErrors(): void {
    errorSummary.hidden = true;
    errorSummary.replaceChildren();
  }

  function showError(message: string): void {
    errorSummary.replaceChildren(create("strong", undefined, "The demo could not run."), create("p", undefined, message));
    errorSummary.hidden = false;
    errorSummary.focus();
  }

  function renderQueue(): void {
    queue.replaceChildren();
    MOCK_SUBMISSIONS.forEach((submission) => {
      const outcome = outcomes.get(submission.application.referenceId);
      const item = create("li", "queue-item");
      const button = create("button", "queue-button");
      button.type = "button";
      button.setAttribute("aria-current", String(submission.application.referenceId === selectedReference));
      const image = create("img", "queue-thumbnail") as HTMLImageElement;
      image.src = submission.imageUrl;
      image.alt = "";
      const text = create("span", "queue-copy");
      text.append(
        create("strong", undefined, submission.application.referenceId),
        create("span", undefined, submission.title),
      );
      const state = create("span", `queue-state ${outcome ? statusClass(outcome.outcome) : ""}`, queueState(outcome, running));
      button.append(image, text, state);
      button.addEventListener("click", () => {
        selectedReference = submission.application.referenceId;
        renderQueue();
        renderDetail();
      });
      item.append(button);
      queue.append(item);
    });
  }

  function renderDetail(): void {
    detail.replaceChildren();
    const submission = MOCK_SUBMISSIONS.find((item) => item.application.referenceId === selectedReference) ?? MOCK_SUBMISSIONS[0]!;
    const outcome = outcomes.get(submission.application.referenceId);
    const header = create("div", "detail-header");
    const headingGroup = create("div");
    headingGroup.append(create("p", "step", "Submitted application"), create("h2", undefined, submission.application.referenceId), create("p", "detail-title", submission.title));
    header.append(headingGroup);
    if (outcome) header.append(create("span", `outcome-badge ${statusClass(outcome.outcome)}`, outcomeLabel(outcome.outcome)));
    detail.append(header);

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
    detail.append(overview);

    const result = create("section", "verification-result");
    if (running) {
      result.append(create("h3", undefined, "Automated review in progress"), create("p", undefined, "The submitted label is being read and compared with the submitted application values."));
    } else if (outcome) {
      renderOutcome(outcome, result, { headingLevel: 3, showHeader: false });
    } else {
      result.append(create("h3", undefined, "Ready for automated review"), create("p", undefined, "Run the demo to extract label information and compare it with this submitted application."));
    }
    detail.append(result);
  }

  function render(): void {
    renderQueue();
    renderDetail();
  }

  runDemo.addEventListener("click", async () => {
    if (running) return;
    clearErrors();
    running = true;
    outcomes = new Map();
    runDemo.disabled = true;
    progressWrap.hidden = false;
    progress.removeAttribute("value");
    progress.max = MOCK_SUBMISSIONS.length;
    status.textContent = `Preparing ${MOCK_SUBMISSIONS.length} submitted applications for review.`;
    render();

    try {
      const controller = new AbortController();
      const entries = await loadDemoEntries(controller.signal);
      status.textContent = `Analyzing ${entries.length} submitted label images. This usually takes less than five seconds per label.`;
      const response = await verifyChunk(entries, controller.signal);
      outcomes = new Map(response.items.map((item) => [item.result.referenceId, item.result]));
      selectedReference = MOCK_SUBMISSIONS.find((submission) => outcomes.get(submission.application.referenceId)?.outcome === "NEEDS_REVIEW")?.application.referenceId
        ?? selectedReference;
      progress.value = MOCK_SUBMISSIONS.length;
      status.textContent = `Finished reviewing ${MOCK_SUBMISSIONS.length} submitted applications.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The submitted applications could not be reviewed.";
      status.textContent = "The demo did not finish.";
      showError(message);
    } finally {
      running = false;
      runDemo.disabled = false;
      runDemo.textContent = outcomes.size ? "Run demo again" : "Run demo";
      render();
    }
  });

  render();
}

const boot = () => {
  if (document.querySelector("#run-demo")) initializeApp();
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
