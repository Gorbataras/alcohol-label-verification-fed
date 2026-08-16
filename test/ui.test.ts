/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeApp, renderOutcome } from "../web/src/main.js";

const html = readFileSync(path.resolve("web/index.html"), "utf8");
const css = readFileSync(path.resolve("web/src/styles.css"), "utf8");

beforeEach(() => {
  document.open();
  document.write(html);
  document.close();
  delete document.documentElement.dataset.labelReviewInitialized;
  initializeApp(document);
});

describe("browser interface", () => {
  it("switches between clearly labeled single and batch workflows", () => {
    const single = document.querySelector<HTMLElement>("#single-panel")!;
    const batch = document.querySelector<HTMLElement>("#batch-panel")!;
    document.querySelector<HTMLButtonElement>("#batch-mode")!.click();
    expect(single.hidden).toBe(true);
    expect(batch.hidden).toBe(false);
    expect(document.querySelector("#batch-mode")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a readable error summary and focuses the first invalid field", () => {
    document.querySelector<HTMLFormElement>("#single-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    const summary = document.querySelector<HTMLElement>("#error-summary")!;
    expect(summary.hidden).toBe(false);
    expect(summary.textContent).toContain("Please fix the following");
    expect(document.activeElement).toBe(document.querySelector('[name="referenceId"]'));
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
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
