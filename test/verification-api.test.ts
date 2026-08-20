import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { FakeLabelExtractionRepository } from "../src/repositories/FakeLabelExtractionRepository.js";
import type { LabelExtractionRepository } from "../src/repositories/LabelExtractionRepository.js";
import { matchingApplication } from "./helpers.js";

const fixture = path.resolve("fixtures/compliant.png");

function application(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ ...matchingApplication, ...overrides });
}

describe("verification API", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp(new FakeLabelExtractionRepository(), { rateLimit: false });
  });

  it("reports health and a plain JSON 404", async () => {
    await request(app).get("/health").expect(200, { status: "ok" });
    const missing = await request(app).get("/missing").expect(404);
    expect(missing.body.error).toMatchObject({ code: "NOT_FOUND", retryable: false });
  });

  it("verifies a valid multipart submission", async () => {
    const response = await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", fixture)
      .expect(200);
    expect(response.body).toMatchObject({
      outcome: "MATCH",
      referenceId: "COLA-1001",
      filename: "compliant.png",
    });
    expect(response.body.fields).toHaveLength(6);
    expect(response.body.warningChecks).toHaveLength(6);
    expect(response.body.fields[0]).toMatchObject({ confidence: 0.98 });
    expect(response.body.warningChecks[0]).toMatchObject({ confidence: 0.98 });
  });

  it("returns needs review for a mismatched extraction", async () => {
    const response = await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", fixture, { filename: "mismatch.png", contentType: "image/png" })
      .expect(200);
    expect(response.body.outcome).toBe("NEEDS_REVIEW");
    expect(response.body.fields[0].status).toBe("MISMATCH");
  });

  it("returns a 503 unavailable outcome for provider failure", async () => {
    const response = await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", fixture, { filename: "unavailable.png", contentType: "image/png" })
      .expect(503);
    expect(response.body).toMatchObject({
      outcome: "UNABLE_TO_VERIFY",
      error: { code: "EXTRACTION_UNAVAILABLE", retryable: true },
    });
  });

  it("validates missing and malformed application/image input", async () => {
    await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe("MISSING_IMAGE"));

    await request(app)
      .post("/api/v1/verifications")
      .field("application", "not json")
      .attach("image", fixture)
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("INVALID_APPLICATION_JSON"));

    await request(app)
      .post("/api/v1/verifications")
      .field("application", application({ brandName: "" }))
      .attach("image", fixture)
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe("INVALID_APPLICATION"));
  });

  it("rejects unsupported and oversized images", async () => {
    await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", Buffer.from("gif"), { filename: "label.gif", contentType: "image/gif" })
      .expect(415)
      .expect(({ body }) => expect(body.error.code).toBe("UNSUPPORTED_IMAGE_TYPE"));

    await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", Buffer.alloc(15 * 1024 * 1024 + 1), { filename: "large.png", contentType: "image/png" })
      .expect(413)
      .expect(({ body }) => expect(body.error.code).toBe("IMAGE_TOO_LARGE"));
  });

  it("rejects an empty image", async () => {
    await request(app)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", Buffer.alloc(0), { filename: "empty.png", contentType: "image/png" })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("EMPTY_IMAGE"));
  });

  it("preserves batch order and isolates invalid/provider-failed items", async () => {
    const applications = [
      matchingApplication,
      { referenceId: "BROKEN" },
      { ...matchingApplication, referenceId: "COLA-1003" },
    ];
    const response = await request(app)
      .post("/api/v1/verifications/batch")
      .field("applications", JSON.stringify(applications))
      .attach("images", fixture, { filename: "compliant.png", contentType: "image/png" })
      .attach("images", fixture, { filename: "bad.png", contentType: "image/png" })
      .attach("images", fixture, { filename: "unavailable.png", contentType: "image/png" })
      .expect(200);
    expect(response.body.items.map((item: any) => item.index)).toEqual([0, 1, 2]);
    expect(response.body.items.map((item: any) => item.result.outcome)).toEqual([
      "MATCH",
      "UNABLE_TO_VERIFY",
      "UNABLE_TO_VERIFY",
    ]);
    expect(response.body.summary).toEqual({ matched: 1, needsReview: 0, unableToVerify: 2, total: 3 });
  });

  it("rejects malformed batch structure", async () => {
    await request(app)
      .post("/api/v1/verifications/batch")
      .field("applications", "{}")
      .attach("images", fixture)
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe("INVALID_BATCH_APPLICATIONS"));

    await request(app)
      .post("/api/v1/verifications/batch")
      .field("applications", JSON.stringify([matchingApplication, matchingApplication]))
      .attach("images", fixture)
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe("BATCH_PAIR_COUNT_MISMATCH"));

    await request(app)
      .post("/api/v1/verifications/batch")
      .field("applications", JSON.stringify(Array.from({ length: 6 }, () => matchingApplication)))
      .attach("images", fixture)
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe("BATCH_SIZE_EXCEEDED"));
  });

  it("does not expose unexpected provider details", async () => {
    const repository: LabelExtractionRepository = {
      extract: async () => { throw new Error("api-key-and-upstream-detail"); },
    };
    const sanitized = buildApp(repository, { rateLimit: false });
    const response = await request(sanitized)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", fixture)
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain("api-key-and-upstream-detail");
    expect(response.body.error).toMatchObject({
      code: "EXTRACTION_UNAVAILABLE",
      message: "The label reader is temporarily unavailable.",
    });
  });

  it("returns the standard error shape when rate limited", async () => {
    const limited = buildApp(new FakeLabelExtractionRepository(), {
      rateLimit: { windowMs: 60_000, limit: 1 },
    });
    const submit = () => request(limited)
      .post("/api/v1/verifications")
      .field("application", application())
      .attach("image", fixture);
    await submit().expect(200);
    const response = await submit().expect(429);
    expect(response.body.error).toEqual({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many labels have been submitted. Wait a minute and try again.",
      retryable: true,
    });
  });
});
