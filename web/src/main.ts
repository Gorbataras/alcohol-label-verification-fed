import { verifyChunk, verifySingle } from "./api.js";
import { processBrowserBatch } from "./batch.js";
import { CSV_TEMPLATE, outcomesToCsv, parseBatchCsv, type BatchCsvRow } from "./csv.js";
import type {
  ApplicationInput,
  BatchEntry,
  FieldCheck,
  VerificationOutcome,
  WarningCheck,
} from "./types.js";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function fieldCard(field: FieldCheck): HTMLLIElement {
  const item = create("li", "check-card");
  item.dataset.status = field.status;
  item.append(create("strong", undefined, `${FIELD_LABELS[field.field] ?? field.field}: ${STATUS_LABELS[field.status] ?? field.status}`));
  const values = create("dl");
  appendDefinition(values, "Expected", field.expected ?? "Not applicable");
  appendDefinition(values, "Observed", field.observed ?? "Not found");
  if (field.score !== null) appendDefinition(values, "Similarity", `${Math.round(field.score * 100)}%`);
  appendDefinition(values, "Reason", field.detail);
  item.append(values);
  return item;
}

function warningCard(check: WarningCheck): HTMLLIElement {
  const item = create("li", "check-card");
  item.dataset.status = check.status;
  item.append(create("strong", undefined, `${WARNING_LABELS[check.check] ?? check.check}: ${STATUS_LABELS[check.status] ?? check.status}`));
  const values = create("dl");
  appendDefinition(values, "Observed", valueText(check.observed));
  appendDefinition(values, "Reason", check.detail);
  item.append(values);
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

  target.append(create("h3", undefined, "Application comparisons"));
  const fields = create("ul", "check-list");
  outcome.fields.forEach((field) => fields.append(fieldCard(field)));
  target.append(fields, create("h3", undefined, "Government warning checks"));
  const warnings = create("ul", "check-list");
  outcome.warningChecks.forEach((check) => warnings.append(warningCard(check)));
  target.append(warnings);
}

function download(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const anchor = create("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function imageError(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type)) return `${file.name}: use a JPEG, PNG, or WebP image.`;
  if (!file.size) return `${file.name}: the image is empty.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: the image is larger than 15 MiB.`;
  return null;
}

export function initializeApp(root: Document = document): void {
  if (root.documentElement.dataset.labelReviewInitialized === "true") return;
  root.documentElement.dataset.labelReviewInitialized = "true";

  const errorSummary = required<HTMLElement>(root, "#error-summary");
  const singleMode = required<HTMLButtonElement>(root, "#single-mode");
  const batchMode = required<HTMLButtonElement>(root, "#batch-mode");
  const singlePanel = required<HTMLElement>(root, "#single-panel");
  const batchPanel = required<HTMLElement>(root, "#batch-panel");
  const singleForm = required<HTMLFormElement>(root, "#single-form");
  const singleSubmit = required<HTMLButtonElement>(root, "#single-submit");
  const singleStatus = required<HTMLElement>(root, "#single-status");
  const singleResults = required<HTMLElement>(root, "#single-results");
  const csvInput = required<HTMLInputElement>(root, "#batch-csv");
  const imagesInput = required<HTMLInputElement>(root, "#batch-images");
  const preflight = required<HTMLElement>(root, "#batch-preflight");
  const batchStart = required<HTMLButtonElement>(root, "#batch-start");
  const batchCancel = required<HTMLButtonElement>(root, "#batch-cancel");
  const progressWrap = required<HTMLElement>(root, "#batch-progress-wrap");
  const progress = required<HTMLProgressElement>(root, "#batch-progress");
  const batchStatus = required<HTMLElement>(root, "#batch-status");
  const batchResults = required<HTMLElement>(root, "#batch-results");

  let batchEntries: BatchEntry[] = [];
  let batchOutcomes: VerificationOutcome[] = [];
  let batchController: AbortController | null = null;
  let preflightVersion = 0;

  function clearErrors(): void {
    errorSummary.hidden = true;
    errorSummary.replaceChildren();
  }

  function showErrors(messages: string[], focus = true): void {
    errorSummary.replaceChildren(create("strong", undefined, "Please fix the following:"));
    const list = create("ul");
    messages.forEach((message) => list.append(create("li", undefined, message)));
    errorSummary.append(list);
    errorSummary.hidden = false;
    if (focus) errorSummary.focus();
  }

  function setMode(mode: "single" | "batch"): void {
    const isSingle = mode === "single";
    singlePanel.hidden = !isSingle;
    batchPanel.hidden = isSingle;
    singleMode.classList.toggle("is-active", isSingle);
    batchMode.classList.toggle("is-active", !isSingle);
    singleMode.setAttribute("aria-pressed", String(isSingle));
    batchMode.setAttribute("aria-pressed", String(!isSingle));
    clearErrors();
    required<HTMLElement>(root, isSingle ? "#single-heading" : "#batch-heading").focus?.();
  }

  singleMode.addEventListener("click", () => setMode("single"));
  batchMode.addEventListener("click", () => setMode("batch"));

  singleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    const invalid = Array.from(singleForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(":invalid"));
    if (invalid.length) {
      invalid.forEach((field) => field.setAttribute("aria-invalid", "true"));
      showErrors(invalid.map((field) => `${field.closest("label")?.firstChild?.textContent?.trim() || field.name} is required.`));
      invalid[0]?.focus();
      return;
    }
    singleForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
    const formData = new FormData(singleForm);
    const image = formData.get("image");
    if (!(image instanceof File)) {
      showErrors(["Choose a label image."]);
      return;
    }
    const fileProblem = imageError(image);
    if (fileProblem) {
      showErrors([fileProblem]);
      return;
    }
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const application: ApplicationInput = {
      referenceId: value("referenceId"),
      brandName: value("brandName"),
      classType: value("classType"),
      alcoholContent: value("alcoholContent"),
      netContents: value("netContents"),
      producerNameAddress: value("producerNameAddress"),
      ...(value("countryOfOrigin") ? { countryOfOrigin: value("countryOfOrigin") } : {}),
    };
    singleSubmit.disabled = true;
    singleStatus.textContent = "Checking the label. This usually takes less than five seconds.";
    singleResults.hidden = true;
    try {
      const result = await verifySingle(application, image);
      renderOutcome(result, singleResults);
      singleResults.hidden = false;
      singleStatus.textContent = `${outcomeLabel(result.outcome)}. Review the details below.`;
      singleResults.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The label could not be checked.";
      showErrors([message]);
      singleStatus.textContent = "The review did not finish.";
    } finally {
      singleSubmit.disabled = false;
    }
  });

  required<HTMLButtonElement>(root, "#download-template").addEventListener("click", () => {
    download("distilled-spirits-label-template.csv", CSV_TEMPLATE);
  });

  async function runPreflight(): Promise<void> {
    const version = ++preflightVersion;
    clearErrors();
    batchEntries = [];
    batchStart.disabled = true;
    const csvFile = csvInput.files?.[0];
    const imageFiles = Array.from(imagesInput.files ?? []);
    if (!csvFile || !imageFiles.length) {
      preflight.textContent = "Choose both the application CSV and label images.";
      return;
    }
    const parsed = parseBatchCsv(await csvFile.text());
    if (version !== preflightVersion) return;
    const errors = [...parsed.errors];
    const imageMap = new Map<string, File>();
    imageFiles.forEach((file) => {
      if (imageMap.has(file.name)) errors.push(`Two selected images are named “${file.name}”. Filenames must be unique.`);
      imageMap.set(file.name, file);
      const problem = imageError(file);
      if (problem) errors.push(problem);
    });
    parsed.rows.forEach((row) => {
      if (!imageMap.has(row.imageFilename)) errors.push(`CSV row ${row.rowNumber}: image “${row.imageFilename}” was not selected.`);
    });
    if (errors.length) {
      preflight.textContent = `${errors.length} problem${errors.length === 1 ? "" : "s"} found.`;
      showErrors(errors, false);
      return;
    }
    batchEntries = parsed.rows.map((row) => ({
      application: row.application,
      image: imageMap.get(row.imageFilename)!,
    }));
    const usedNames = new Set(parsed.rows.map((row) => row.imageFilename));
    const extras = imageFiles.filter((file) => !usedNames.has(file.name)).length;
    preflight.textContent = `${batchEntries.length} application${batchEntries.length === 1 ? "" : "s"} ready${extras ? `; ${extras} unreferenced image${extras === 1 ? "" : "s"} will be ignored` : ""}.`;
    batchStart.disabled = false;
  }

  csvInput.addEventListener("change", () => void runPreflight());
  imagesInput.addEventListener("change", () => void runPreflight());

  function renderBatchResults(): void {
    batchResults.replaceChildren();
    const header = create("div", "result-header");
    header.append(create("h2", undefined, "Batch results"));
    const exportButton = create("button", "secondary-action", "Export results CSV");
    exportButton.type = "button";
    exportButton.addEventListener("click", () => download("label-review-results.csv", outcomesToCsv(batchOutcomes)));
    header.append(exportButton);
    batchResults.append(header);

    const summary = create("div", "batch-summary");
    const counts = [
      ["Matched", batchOutcomes.filter((result) => result.outcome === "MATCH").length],
      ["Needs review", batchOutcomes.filter((result) => result.outcome === "NEEDS_REVIEW").length],
      ["Unable", batchOutcomes.filter((result) => result.outcome === "UNABLE_TO_VERIFY").length],
    ] as const;
    counts.forEach(([label, count]) => {
      const card = create("div", "summary-card");
      card.append(create("strong", undefined, String(count)), create("span", undefined, label));
      summary.append(card);
    });
    batchResults.append(summary);

    batchOutcomes.forEach((outcome, index) => {
      const details = create("details", "batch-result");
      const summaryLine = create("summary");
      summaryLine.append(
        create("span", undefined, `${outcome.referenceId} — `),
        create("span", `outcome-badge ${statusClass(outcome.outcome)}`, outcomeLabel(outcome.outcome)),
      );
      const content = create("div", "batch-result-content");
      renderOutcome(outcome, content, { headingLevel: 3, showHeader: false });
      if (outcome.outcome === "UNABLE_TO_VERIFY" && outcome.error.retryable) {
        const retry = create("button", "secondary-action", "Retry this label");
        retry.type = "button";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          retry.textContent = "Retrying…";
          try {
            batchOutcomes[index] = await verifySingle(batchEntries[index]!.application, batchEntries[index]!.image);
            renderBatchResults();
            batchResults.focus();
          } catch (error) {
            showErrors([error instanceof Error ? error.message : "Retry failed."]);
            retry.disabled = false;
            retry.textContent = "Retry this label";
          }
        });
        content.append(retry);
      }
      details.append(summaryLine, content);
      batchResults.append(details);
    });
    batchResults.hidden = false;
  }

  batchStart.addEventListener("click", async () => {
    if (!batchEntries.length) return;
    clearErrors();
    batchController = new AbortController();
    batchStart.disabled = true;
    batchCancel.hidden = false;
    progressWrap.hidden = false;
    batchResults.hidden = true;
    progress.max = batchEntries.length;
    progress.value = 0;
    batchStatus.textContent = `Starting ${batchEntries.length} label reviews.`;
    try {
      batchOutcomes = await processBrowserBatch(batchEntries, verifyChunk, {
        signal: batchController.signal,
        chunkSize: 5,
        concurrency: 2,
        onProgress: ({ completed, total }) => {
          progress.value = completed;
          batchStatus.textContent = `${completed} of ${total} labels finished.`;
        },
      });
      renderBatchResults();
      batchStatus.textContent = `Finished ${batchEntries.length} label reviews.`;
      batchResults.focus();
    } catch (error) {
      if (batchController.signal.aborted) {
        batchStatus.textContent = "Batch review cancelled. Completed results were not retained.";
      } else {
        showErrors([error instanceof Error ? error.message : "The batch could not be completed."]);
      }
    } finally {
      batchController = null;
      batchStart.disabled = false;
      batchCancel.hidden = true;
    }
  });

  batchCancel.addEventListener("click", () => batchController?.abort());
}

const boot = () => {
  if (document.querySelector("#single-form")) initializeApp();
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

export type { BatchCsvRow };
