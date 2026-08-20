import type { ExtractedLabel } from "../dtos/VerificationDto.js";
import { ProviderUnavailableError } from "../errors/index.js";
import { CANONICAL_GOVERNMENT_WARNING } from "../domain/warning.js";
import type {
  LabelExtractionRepository,
  ProcessedLabelImage,
} from "./LabelExtractionRepository.js";

export class FakeLabelExtractionRepository implements LabelExtractionRepository {
  async extract(image: ProcessedLabelImage, signal: AbortSignal): Promise<ExtractedLabel> {
    if (signal.aborted) {
      throw new ProviderUnavailableError("EXTRACTION_TIMEOUT", "Label extraction timed out.");
    }
    if (image.filename.toLocaleLowerCase("en-US").includes("unavailable")) {
      throw new ProviderUnavailableError(
        "EXTRACTION_UNAVAILABLE",
        "The label reader is temporarily unavailable.",
      );
    }
    const filename = image.filename.toLocaleLowerCase("en-US");
    const mismatch = filename.includes("mismatch");
    const warningCase = filename.includes("warning-case");
    const lowConfidence = filename.includes("glare") || filename.includes("low-contrast") || filename.includes("blur");
    const baseConfidence = lowConfidence ? 0.72 : 0.98;
    return {
      imageUsable: true,
      brandName: mismatch ? "SOME OTHER DISTILLERY" : "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
      countryOfOrigin: "United States",
      governmentWarningText: warningCase
        ? CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:")
        : CANONICAL_GOVERNMENT_WARNING,
      warningFormat: {
        headingIsUppercase: !warningCase,
        headingIsBold: true,
        bodyIsNotBold: true,
        separateFromOtherText: true,
        continuousParagraph: true,
      },
      confidence: {
        brandName: baseConfidence,
        classType: baseConfidence,
        alcoholContent: baseConfidence,
        netContents: baseConfidence,
        producerNameAddress: baseConfidence,
        countryOfOrigin: baseConfidence,
        governmentWarningText: baseConfidence,
        warningFormat: {
          headingIsUppercase: baseConfidence,
          headingIsBold: baseConfidence,
          bodyIsNotBold: baseConfidence,
          separateFromOtherText: baseConfidence,
          continuousParagraph: baseConfidence,
        },
      },
    };
  }
}
