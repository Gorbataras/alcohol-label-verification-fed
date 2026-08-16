import type { ExtractedLabel } from "../dtos/VerificationDto.js";

export interface ProcessedLabelImage {
  bytes: Buffer;
  filename: string;
  mimeType: "image/jpeg";
}

export interface LabelExtractionRepository {
  extract(image: ProcessedLabelImage, signal: AbortSignal): Promise<ExtractedLabel>;
}
