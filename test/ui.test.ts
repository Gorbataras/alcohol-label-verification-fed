/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_SUBMISSIONS } from "../web/src/mock-submissions.js";
import { initializeApp, renderOutcome } from "../web/src/main.js";

const html = readFileSync(path.resolve("web/index.html"), "utf8");
const css = readFileSync(path.resolve("web/src/styles.css"), "utf8");

beforeEach(() => {
  document.open();
  document.write(html);
  document.close();
  delete document.documentElement.dataset.labelReviewInitialized;
  vi.unstubAllGlobals();
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

describe("browser interface", () => {
  it("shows a five-item submitted-application queue without import or editing controls", () => {
    expect(document.querySelectorAll("#application-queue .queue-button")).toHaveLength(5);
    expect(document.querySelector("#run-demo")?.textContent).toContain("Run demo");
    expect(document.querySelector("input, textarea, form")).toBeNull();
    expect(document.body.textContent).toContain("COLA-DEMO-1001");
    expect(document.body.textContent).toContain("Submitted application values");
  });

  it("opens the selected submitted application and its label image", () => {
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

  it("loads the bundled submissions, sends one demo batch, and renders rerun state", async () => {
    const fetchMock = vi.fn(async (input: string | Request) => {
      if (typeof input === "string" && !input.startsWith("/api/")) {
        return new Response(new Blob(["image"], { type: "image/png" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        summary: { matched: 5, needsReview: 0, unableToVerify: 0, total: 5 },
        items: MOCK_SUBMISSIONS.map((submission, index) => matched(submission.application.referenceId, index)),
        processingMs: 10,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    document.querySelector<HTMLButtonElement>("#run-demo")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#demo-status")?.textContent).toContain("Finished reviewing 5");
    });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(document.querySelector<HTMLButtonElement>("#run-demo")?.textContent).toBe("Run demo again");
    expect(document.querySelector("#application-queue")?.textContent).toContain("Match");
  });

  it("reports a bundled-image failure without leaving the reviewer in a running state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    document.querySelector<HTMLButtonElement>("#run-demo")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>("#error-summary")?.hidden).toBe(false);
    });
    expect(document.querySelector("#demo-status")?.textContent).toContain("did not finish");
    expect(document.querySelector<HTMLButtonElement>("#run-demo")?.disabled).toBe(false);
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
