import type {
  ApplicationInput,
  ExtractedLabel,
  ExtractionConfidence,
} from "../src/dtos/VerificationDto.js";
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

type ExtractedLabelOverrides = Omit<Partial<ExtractedLabel>, "warningFormat" | "confidence"> & {
  warningFormat?: Partial<ExtractedLabel["warningFormat"]>;
  confidence?: Partial<Omit<ExtractionConfidence, "warningFormat">> & {
    warningFormat?: Partial<ExtractionConfidence["warningFormat"]>;
  };
};

export function extractedLabel(overrides: ExtractedLabelOverrides = {}): ExtractedLabel {
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
    confidence: {
      brandName: 0.98,
      classType: 0.98,
      alcoholContent: 0.98,
      netContents: 0.98,
      producerNameAddress: 0.98,
      countryOfOrigin: 0.98,
      governmentWarningText: 0.98,
      ...overrides.confidence,
      warningFormat: {
        headingIsUppercase: 0.98,
        headingIsBold: 0.98,
        bodyIsNotBold: 0.98,
        separateFromOtherText: 0.98,
        continuousParagraph: 0.98,
        ...overrides.confidence?.warningFormat,
      },
    },
  };
}
