import { describe, expect, it, vi } from "vitest";
import { processBrowserBatch } from "../web/src/batch.js";
import type { BatchEntry, BatchVerificationResponse, VerificationOutcome } from "../web/src/types.js";

function entries(count: number): BatchEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    application: {
      referenceId: `REF-${index}`,
      brandName: "Brand",
      classType: "Vodka",
      alcoholContent: "40%",
      netContents: "750 mL",
      producerNameAddress: "Producer, Austin, TX",
    },
    image: new File(["image"], `label-${index}.png`, { type: "image/png" }),
  }));
}

function matched(entry: BatchEntry): VerificationOutcome {
  return {
    outcome: "MATCH",
    referenceId: entry.application.referenceId,
    filename: entry.image.name,
    fields: [],
    warningChecks: [],
    processingMs: 10,
  };
}

describe("browser batch orchestration", () => {
  it("uses five-item chunks, bounded concurrency, progress, and stable ordering", async () => {
    const progress = vi.fn();
    const sizes: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const verify = vi.fn(async (chunk: BatchEntry[]): Promise<BatchVerificationResponse> => {
      sizes.push(chunk.length);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return {
        summary: { matched: chunk.length, needsReview: 0, unableToVerify: 0, total: chunk.length },
        items: chunk.map((entry, index) => ({ index, result: matched(entry) })),
        processingMs: 2,
      };
    });
    const results = await processBrowserBatch(entries(12), verify, {
      signal: new AbortController().signal,
      onProgress: progress,
    });
    expect(sizes.sort((a, b) => b - a)).toEqual([5, 5, 2]);
    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.referenceId)).toEqual(Array.from({ length: 12 }, (_, index) => `REF-${index}`));
    expect(progress).toHaveBeenLastCalledWith({ completed: 12, total: 12 });
  });

  it("isolates failed chunks as retryable unavailable outcomes", async () => {
    const results = await processBrowserBatch(
      entries(3),
      async () => { throw new Error("Network unavailable"); },
      { signal: new AbortController().signal },
    );
    expect(results).toHaveLength(3);
    expect(results.every((result) => result.outcome === "UNABLE_TO_VERIFY")).toBe(true);
    expect(results[0]).toMatchObject({ error: { code: "BATCH_REQUEST_FAILED", retryable: true } });
  });

  it("stops before work when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      processBrowserBatch(entries(1), vi.fn(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
