import { describe, expect, it } from "vitest";
import {
  canonicalizeCountry,
  compareLabel,
  compareWarning,
  normalizeText,
  parseAbv,
  parseVolumeMl,
  textSimilarity,
} from "../src/domain/comparison.js";
import { CANONICAL_GOVERNMENT_WARNING } from "../src/domain/warning.js";
import { extractedLabel, matchingApplication } from "./helpers.js";

describe("comparison normalization", () => {
  it("normalizes case, apostrophes, dashes, punctuation, and whitespace", () => {
    expect(normalizeText("  STONE’S—THROW! ")).toBe("stone s throw");
    expect(textSimilarity("Stone's Throw", "STONE’S THROW")).toBe(1);
  });

  it("uses token order and conservative fuzzy scoring", () => {
    expect(textSimilarity("Old Tom Distillery", "Distillery Old Tom")).toBe(1);
    expect(textSimilarity("Old Tom Distillery", "Old Tom Distilery")).toBeGreaterThanOrEqual(0.92);
    expect(textSimilarity("Old Tom Distillery", "Different Brand")).toBeLessThan(0.8);
  });

  it("normalizes ABV, proof, volume units, and country names", () => {
    expect(parseAbv("45% Alc./Vol. (90 Proof)")).toBe(45);
    expect(parseAbv("90 proof")).toBe(45);
    expect(parseVolumeMl("75 cL")).toBe(750);
    expect(parseVolumeMl("0.75 L")).toBe(750);
    expect(parseVolumeMl("25.36 fl. oz.")).toBeCloseTo(750, 0);
    expect(canonicalizeCountry("U.S.A.")).toBe("US");
    expect(canonicalizeCountry("United States of America")).toBe("US");
    expect(canonicalizeCountry("Product of United States")).toBe("US");
    expect(canonicalizeCountry("Made in France")).toBe("FR");
  });
});

describe("label result", () => {
  it("matches normalized application values and optional country", () => {
    const result = compareLabel(matchingApplication, extractedLabel(), "label.png", 125);
    expect(result.outcome).toBe("MATCH");
    expect(result.fields).toHaveLength(6);
    expect(result.warningChecks).toHaveLength(6);
  });

  it("marks an omitted country not applicable", () => {
    const application = { ...matchingApplication, countryOfOrigin: undefined };
    const result = compareLabel(application, extractedLabel({ countryOfOrigin: null }), "label.png", 1);
    expect(result.fields.at(-1)?.status).toBe("NOT_APPLICABLE");
    expect(result.outcome).toBe("MATCH");
  });

  it("requires review for mismatches, unreadable values, and borderline text", () => {
    const mismatch = compareLabel(
      matchingApplication,
      extractedLabel({ brandName: "Different Brand", alcoholContent: null }),
      "label.png",
      1,
    );
    expect(mismatch.outcome).toBe("NEEDS_REVIEW");
    expect(mismatch.fields[0]?.status).toBe("MISMATCH");
    expect(mismatch.fields[2]?.status).toBe("NOT_FOUND");
  });

  it("preserves warning case and punctuation while normalizing layout whitespace", () => {
    const wrapped = CANONICAL_GOVERNMENT_WARNING.replaceAll(" ", "\n");
    expect(compareWarning(extractedLabel({ governmentWarningText: wrapped }))[0]?.status).toBe("MATCH");
    expect(
      compareWarning(extractedLabel({ governmentWarningText: CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT", "Government") }))[0]?.status,
    ).toBe("MISMATCH");
  });

  it.each([
    "headingIsUppercase",
    "headingIsBold",
    "bodyIsNotBold",
    "separateFromOtherText",
    "continuousParagraph",
  ] as const)("requires review when %s fails or is uncertain", (key) => {
    const failed = compareLabel(
      matchingApplication,
      extractedLabel({ warningFormat: { [key]: false } }),
      "label.png",
      1,
    );
    const uncertain = compareLabel(
      matchingApplication,
      extractedLabel({ warningFormat: { [key]: null } }),
      "label.png",
      1,
    );
    expect(failed.outcome).toBe("NEEDS_REVIEW");
    expect(uncertain.outcome).toBe("NEEDS_REVIEW");
  });
});
