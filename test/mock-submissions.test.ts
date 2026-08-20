import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOCK_SUBMISSIONS } from "../web/src/mock-submissions.js";

describe("mocked reviewer submissions", () => {
  it("provides five complete applications backed by bundled label fixtures", () => {
    expect(MOCK_SUBMISSIONS).toHaveLength(5);
    expect(new Set(MOCK_SUBMISSIONS.map((submission) => submission.application.referenceId)).size).toBe(5);

    MOCK_SUBMISSIONS.forEach((submission) => {
      expect(submission.application).toMatchObject({
        referenceId: expect.any(String),
        brandName: expect.any(String),
        classType: expect.any(String),
        alcoholContent: expect.any(String),
        netContents: expect.any(String),
        producerNameAddress: expect.any(String),
        countryOfOrigin: expect.any(String),
      });
      expect(submission.imageUrl).toBe(`/${submission.imageFilename}`);
      expect(existsSync(path.resolve("fixtures", submission.imageFilename))).toBe(true);
    });
  });
});
