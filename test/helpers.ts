import type { ApplicationInput, ExtractedLabel } from "../src/dtos/VerificationDto.js";
import { CANONICAL_GOVERNMENT_WARNING } from "../src/domain/warning.js";

export const matchingApplication: ApplicationInput = {
  referenceId: "COLA-1001",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
  countryOfOrigin: "United States",
};

export function extractedLabel(
  overrides: Omit<Partial<ExtractedLabel>, "warningFormat"> & {
    warningFormat?: Partial<ExtractedLabel["warningFormat"]>;
  } = {},
): ExtractedLabel {
  return {
    imageUsable: true,
    brandName: "Old Tom Distillery",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "90 Proof",
    netContents: "0.75 L",
    producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
    countryOfOrigin: "USA",
    governmentWarningText: CANONICAL_GOVERNMENT_WARNING,
    ...overrides,
    warningFormat: {
      headingIsUppercase: true,
      headingIsBold: true,
      bodyIsNotBold: true,
      separateFromOtherText: true,
      continuousParagraph: true,
      ...overrides.warningFormat,
    },
  };
}
