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
    const mismatch = image.filename.toLocaleLowerCase("en-US").includes("mismatch");
    return {
      imageUsable: true,
      brandName: mismatch ? "SOME OTHER DISTILLERY" : "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
      countryOfOrigin: "United States",
      governmentWarningText: CANONICAL_GOVERNMENT_WARNING,
      warningFormat: {
        headingIsUppercase: true,
        headingIsBold: true,
        bodyIsNotBold: true,
        separateFromOtherText: true,
        continuousParagraph: true,
      },
    };
  }
}
