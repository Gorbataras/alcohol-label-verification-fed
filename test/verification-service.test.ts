import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { UploadedImage } from "../src/dtos/VerificationDto.js";
import { ProviderUnavailableError } from "../src/errors/index.js";
import { FakeLabelExtractionRepository } from "../src/repositories/FakeLabelExtractionRepository.js";
import type { LabelExtractionRepository } from "../src/repositories/LabelExtractionRepository.js";
import { VerificationService } from "../src/services/VerificationService.js";
import { extractedLabel, matchingApplication } from "./helpers.js";

let imageBytes: Buffer;

beforeAll(async () => {
  imageBytes = await readFile(path.resolve("fixtures/compliant.png"));
});

function image(filename = "compliant.png", mimeType = "image/png"): UploadedImage {
  return { buffer: imageBytes, filename, mimeType };
}

describe("VerificationService", () => {
  it("preprocesses and verifies a matching label", async () => {
    const service = new VerificationService(new FakeLabelExtractionRepository());
    const result = await service.verify(matchingApplication, image());
    expect(result.outcome).toBe("MATCH");
    expect(result.filename).toBe("compliant.png");
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
  });

  it("returns deterministic demo outcomes for the bundled sample filenames", async () => {
    const service = new VerificationService(new FakeLabelExtractionRepository());
    const compliant = await service.verify(matchingApplication, image("compliant.png"));
    const mismatch = await service.verify(matchingApplication, image("brand-mismatch.png"));
    const warning = await service.verify(matchingApplication, image("warning-case.png"));
    const glare = await service.verify(matchingApplication, image("glare.png"));
    const rotated = await service.verify(matchingApplication, image("rotated.png"));

    expect(compliant.outcome).toBe("MATCH");
    expect(mismatch.outcome).toBe("NEEDS_REVIEW");
    expect(mismatch.outcome === "NEEDS_REVIEW" && mismatch.fields[0]).toMatchObject({ status: "MISMATCH" });
    expect(warning.outcome).toBe("NEEDS_REVIEW");
    expect(warning.outcome === "NEEDS_REVIEW" && warning.warningChecks[0]).toMatchObject({ status: "MISMATCH" });
    expect(glare.outcome).toBe("NEEDS_REVIEW");
    expect(glare.outcome === "NEEDS_REVIEW" && glare.fields[0]).toMatchObject({ status: "UNCERTAIN", confidence: 0.72 });
    expect(rotated.outcome).toBe("MATCH");
  });

  it("rejects unsupported, empty, oversized, and corrupt images", async () => {
    const service = new VerificationService(new FakeLabelExtractionRepository());
    await expect(service.verify(matchingApplication, image("label.gif", "image/gif"))).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_TYPE" });
    await expect(service.verify(matchingApplication, { ...image(), buffer: Buffer.alloc(0) })).rejects.toMatchObject({ code: "EMPTY_IMAGE" });
    await expect(service.verify(matchingApplication, { ...image(), buffer: Buffer.alloc(15 * 1024 * 1024 + 1) })).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    await expect(service.verify(matchingApplication, { ...image(), buffer: Buffer.from("not an image") })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  it("returns unavailable for unusable images and provider failures", async () => {
    const unusable: LabelExtractionRepository = { extract: async () => extractedLabel({ imageUsable: false }) };
    const unavailable: LabelExtractionRepository = {
      extract: async () => { throw new ProviderUnavailableError("UPSTREAM", "Try later."); },
    };
    expect((await new VerificationService(unusable).verify(matchingApplication, image())).outcome).toBe("UNABLE_TO_VERIFY");
    const result = await new VerificationService(unavailable).verify(matchingApplication, image());
    expect(result).toMatchObject({ outcome: "UNABLE_TO_VERIFY", error: { code: "UPSTREAM", retryable: true } });
  });

  it("enforces the provider deadline without retrying", async () => {
    let calls = 0;
    const repository: LabelExtractionRepository = {
      extract: (_image, signal): Promise<never> => {
        calls += 1;
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("late provider", "AbortError")));
        });
      },
    };
    const result = await new VerificationService(repository, 5).verify(matchingApplication, image());
    expect(result).toMatchObject({
      outcome: "UNABLE_TO_VERIFY",
      error: { code: "EXTRACTION_TIMEOUT", retryable: true },
    });
    expect(calls).toBe(1);
  });

  it("isolates invalid and unavailable batch items while preserving order", async () => {
    const service = new VerificationService(new FakeLabelExtractionRepository());
    const response = await service.verifyBatch(
      [matchingApplication, { referenceId: "bad" }, { ...matchingApplication, referenceId: "third" }],
      [image(), image("bad.png"), image("unavailable.png")],
    );
    expect(response.items.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(response.items.map((item) => item.result.outcome)).toEqual([
      "MATCH",
      "UNABLE_TO_VERIFY",
      "UNABLE_TO_VERIFY",
    ]);
    expect(response.summary).toEqual({ matched: 1, needsReview: 0, unableToVerify: 2, total: 3 });
  });
});
