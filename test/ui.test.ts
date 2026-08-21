/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, renderOutcome } from "../web/src/main.js";

const html = readFileSync(path.resolve("web/index.html"), "utf8");
const css = readFileSync(path.resolve("web/src/styles.css"), "utf8");

beforeEach(() => {
  document.open();
  document.write(html);
  document.close();
  delete document.documentElement.dataset.labelReviewInitialized;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: () => "blob:test",
    });
  }
  initializeApp(document);
});

function matched(referenceId: string, index: number) {
  return {
    index,
    result: {
      outcome: "MATCH" as const,
      referenceId,
      filename: "compliant.png",
      fields: [],
      warningChecks: [],
      processingMs: 10,
    },
  };
}

function loadSamples(): void {
  document.querySelector<HTMLButtonElement>("#load-demo")!.click();
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubReviewFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url.includes("/api/")) {
      return new Response(new Blob(["image"], { type: "image/png" }), { status: 200 });
    }
    const body = init?.body;
    let items = [matched("unknown", 0)];
    if (body instanceof FormData) {
      const raw = body.get("application") ?? body.get("applications");
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw) as { referenceId: string } | Array<{ referenceId: string }>;
        const applications = Array.isArray(parsed) ? parsed : [parsed];
        items = applications.map((application, index) => matched(application.referenceId, index));
      }
    }
    const single = url.endsWith("/verifications") && items[0];
    if (single && !url.includes("/batch")) {
      return new Response(JSON.stringify(single.result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      summary: { matched: items.length, needsReview: 0, unableToVerify: 0, total: items.length },
      items,
      processingMs: 10,
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      [Symbol.iterator]: function* () { yield file; },
    },
  });
}

describe("browser interface", () => {
  it("starts with an empty queue and disabled processing actions", () => {
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(0);
    expect(document.querySelector("#load-demo")?.textContent).toContain("Load demo samples");
    expect(document.querySelector("#run-demo")).toBeNull();
    expect(document.querySelector("#queue-empty")?.textContent).toContain("The review queue is empty");
    expect(document.querySelector("#application-detail")?.textContent).toContain("No application selected");
    expect(document.querySelector<HTMLButtonElement>("#process-selected")?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("#process-batch")?.disabled).toBe(true);
    expect(document.querySelector("#decision-empty")?.textContent).toContain("No applications have been approved or denied yet");
    expect(document.querySelector("#decision-counts")?.textContent).toContain("Approved 0 · Denied 0");
    expect(document.querySelectorAll("#decision-list .queue-button")).toHaveLength(0);
    expect(document.querySelector("#approve-application")).toBeNull();
    expect(document.querySelector("#deny-application")).toBeNull();
  });

  it("loads bundled samples into the queue without calling the verification API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    loadSamples();
    loadSamples();
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(5);
    expect(document.body.textContent).toContain("COLA-DEMO-1001");
    expect(document.querySelector("#application-detail")?.textContent).toContain("Submitted application values");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the selected submitted application and its label image", () => {
    loadSamples();
    document.querySelectorAll<HTMLButtonElement>("#application-queue .queue-button")[1]!.click();
    const detail = document.querySelector<HTMLElement>("#application-detail")!;
    expect(detail.textContent).toContain("COLA-DEMO-1002");
    expect(detail.textContent).toContain("Submitted brand does not match");
    expect(detail.querySelector("img")?.getAttribute("alt")).toContain("COLA-DEMO-1002");
  });

  it("renders confidence separately from similarity and flags low confidence", () => {
    const target = document.createElement("section");
    renderOutcome(
      {
        outcome: "NEEDS_REVIEW",
        referenceId: "COLA-DEMO-1004",
        filename: "glare.png",
        processingMs: 10,
        fields: [{
          field: "brandName",
          status: "UNCERTAIN",
          expected: "OLD TOM DISTILLERY",
          observed: "OLD TOM DISTILLERY",
          score: 1,
          confidence: 0.72,
          detail: "Extraction confidence is below 85%; review the label image manually.",
        }],
        warningChecks: [],
      },
      target,
    );
    expect(target.textContent).toContain("Extraction confidence");
    expect(target.textContent).toContain("72%");
    expect(target.textContent).toContain("Similarity");
    expect(target.textContent).toContain("Low confidence");
  });

  it("expands checks that need review and collapses matching checks", () => {
    const target = document.createElement("section");
    renderOutcome(
      {
        outcome: "NEEDS_REVIEW",
        referenceId: "COLA-DEMO-1002",
        filename: "brand-mismatch.png",
        processingMs: 10,
        fields: [
          {
            field: "brandName",
            status: "MISMATCH",
            expected: "OLD TOM DISTILLERY",
            observed: "STONE'S THROW",
            score: 0.4,
            confidence: 0.94,
            detail: "Submitted brand does not match the label.",
          },
          {
            field: "classType",
            status: "MATCH",
            expected: "Kentucky Straight Bourbon Whiskey",
            observed: "Kentucky Straight Bourbon Whiskey",
            score: 1,
            confidence: 0.96,
            detail: "Submitted class or type matches the label.",
          },
        ],
        warningChecks: [
          {
            check: "text",
            status: "MATCH",
            expected: true,
            observed: true,
            confidence: 0.95,
            detail: "Required warning text is present.",
          },
          {
            check: "headingUppercase",
            status: "UNCERTAIN",
            expected: true,
            observed: true,
            confidence: 0.72,
            detail: "Extraction confidence is below 85%; review the label image manually.",
          },
        ],
      },
      target,
    );
    const details = target.querySelector("details.matched-checks");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toContain("checks matched");
    const issueCards = [...target.querySelectorAll<HTMLElement>(":scope > .check-list .check-card")];
    expect(issueCards.map((card) => card.dataset.status)).toEqual(["MISMATCH", "UNCERTAIN"]);
    const matchedCards = [...details!.querySelectorAll<HTMLElement>(".check-card")];
    expect(matchedCards.map((card) => card.dataset.status)).toEqual(["MATCH", "MATCH"]);
    expect(target.textContent).toContain("Submitted brand does not match the label.");
    expect(target.textContent).toContain("Kentucky Straight Bourbon Whiskey");
  });

  it("processes the selected application with a single verification request", async () => {
    loadSamples();
    const fetchMock = stubReviewFetch();
    document.querySelector<HTMLButtonElement>("#process-selected")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#demo-status")?.textContent).toContain("Finished reviewing COLA-DEMO-1001");
    });
    const apiCalls = fetchMock.mock.calls.filter(([input]) => requestUrl(input).includes("/api/"));
    expect(apiCalls).toHaveLength(1);
    expect(requestUrl(apiCalls[0]![0])).toContain("/api/v1/verifications");
    expect(requestUrl(apiCalls[0]![0])).not.toContain("/batch");
    expect(document.querySelector("#application-queue")?.textContent).toContain("Match");
  });

  it("hides approve and deny until automated review finishes", () => {
    loadSamples();
    expect(document.querySelector("#approve-application")).toBeNull();
    expect(document.querySelector("#deny-application")).toBeNull();
  });

  it("approves a processed application into the decisions summary and advances selection", async () => {
    loadSamples();
    stubReviewFetch();
    document.querySelector<HTMLButtonElement>("#process-selected")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#approve-application")).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>("#approve-application")!.click();
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(4);
    expect(document.querySelector("#application-queue")?.textContent).not.toContain("COLA-DEMO-1001");
    expect(document.querySelector("#decision-list")?.textContent).toContain("COLA-DEMO-1001");
    expect(document.querySelector("#decision-list")?.textContent).toContain("Approved");
    expect(document.querySelector("#decision-counts")?.textContent).toContain("Approved 1 · Denied 0");
    expect(document.querySelector("#demo-status")?.textContent).toContain("Approved COLA-DEMO-1001");
    expect(document.querySelector("#application-detail")?.textContent).toContain("COLA-DEMO-1002");
    expect(document.querySelector("#approve-application")).toBeNull();
  });

  it("denies a processed application into the decisions summary", async () => {
    loadSamples();
    stubReviewFetch();
    document.querySelector<HTMLButtonElement>("#process-selected")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#deny-application")).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>("#deny-application")!.click();
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(4);
    expect(document.querySelector("#decision-list")?.textContent).toContain("Denied");
    expect(document.querySelector("#decision-counts")?.textContent).toContain("Approved 0 · Denied 1");
    expect(document.querySelector("#demo-status")?.textContent).toContain("Denied COLA-DEMO-1001");
  });

  it("reopens a decided application from the summary without returning it to the queue", async () => {
    loadSamples();
    stubReviewFetch();
    document.querySelector<HTMLButtonElement>("#process-selected")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#approve-application")).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>("#approve-application")!.click();
    document.querySelector<HTMLButtonElement>("#decision-list .queue-button")!.click();
    const detail = document.querySelector<HTMLElement>("#application-detail")!;
    expect(detail.textContent).toContain("COLA-DEMO-1001");
    expect(detail.textContent).toContain("Approved");
    expect(document.querySelector("#approve-application")).toBeNull();
    expect(document.querySelector("#deny-application")).toBeNull();
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(4);
    expect(document.querySelector<HTMLButtonElement>("#process-selected")?.disabled).toBe(true);
  });

  it("processes the next three unprocessed applications as a batch", async () => {
    loadSamples();
    const fetchMock = stubReviewFetch();
    document.querySelector<HTMLButtonElement>("#process-batch")!.click();
    document.querySelector<HTMLButtonElement>("[data-batch-count='3']")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#demo-status")?.textContent).toContain("Finished reviewing 3");
    });
    const batchCall = fetchMock.mock.calls.find(([input, init]) => (
      requestUrl(input).includes("/api/v1/verifications/batch") && init?.body instanceof FormData
    ));
    expect(batchCall).toBeDefined();
    const applications = JSON.parse(String((batchCall![1]!.body as FormData).get("applications"))) as Array<{ referenceId: string }>;
    expect(applications.map((item) => item.referenceId)).toEqual([
      "COLA-DEMO-1001",
      "COLA-DEMO-1002",
      "COLA-DEMO-1003",
    ]);
    expect(document.querySelector("#application-queue")?.textContent).toContain("Match");
    expect(document.querySelector("#application-queue")?.textContent).toContain("Ready for review");
  });

  it("adds a manually entered application to the queue", () => {
    document.querySelector<HTMLButtonElement>("#add-application")!.click();
    document.querySelector<HTMLInputElement>("#application-reference-id")!.value = "COLA-MANUAL-1";
    document.querySelector<HTMLInputElement>("#application-brand-name")!.value = "Harbor Gin";
    document.querySelector<HTMLInputElement>("#application-class-type")!.value = "Gin";
    document.querySelector<HTMLInputElement>("#application-alcohol-content")!.value = "40% Alc./Vol.";
    document.querySelector<HTMLInputElement>("#application-net-contents")!.value = "750 mL";
    document.querySelector<HTMLInputElement>("#application-producer")!.value = "Harbor Distilling, Portland, Oregon";
    setFile(
      document.querySelector<HTMLInputElement>("#application-image")!,
      new File(["image"], "harbor-gin.png", { type: "image/png" }),
    );
    document.querySelector<HTMLFormElement>("#add-application-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(document.querySelector("#add-application-error")?.textContent).toBe("");
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(1);
    expect(document.querySelector("#application-queue")?.textContent).toContain("COLA-MANUAL-1");
    expect(document.querySelector("#application-detail")?.textContent).toContain("Harbor Gin");
  });

  it("reports a bundled-image failure without leaving the reviewer in a running state", async () => {
    loadSamples();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    document.querySelector<HTMLButtonElement>("#process-selected")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>("#error-summary")?.hidden).toBe(false);
    });
    expect(document.querySelector("#demo-status")?.textContent).toContain("did not finish");
    expect(document.querySelector<HTMLButtonElement>("#process-selected")?.disabled).toBe(false);
  });

  it("renders external text as text rather than executable markup", () => {
    const target = document.createElement("section");
    renderOutcome(
      {
        outcome: "UNABLE_TO_VERIFY",
        referenceId: '<img src=x onerror="alert(1)">',
        filename: "label.png",
        error: { code: "FAILED", message: "Could not read", retryable: false },
        processingMs: 1,
      },
      target,
    );
    expect(target.querySelector("img")).toBeNull();
    expect(target.textContent).toContain("<img src=x");
  });

  it("has no automated accessibility violations in the initial document", async () => {
    const result = await axe.run(document, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("keeps large controls, visible focus, responsive reflow, and reduced-motion rules", () => {
    expect(css).toContain("font-size: 18px");
    expect(css).toContain("min-height: 52px");
    expect(css).toContain("outline: 4px solid var(--focus)");
    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
