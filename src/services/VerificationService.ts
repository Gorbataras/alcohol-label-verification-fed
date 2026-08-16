import path from "node:path";
import sharp from "sharp";
import {
  ApplicationInputSchema,
  type ApplicationInput,
  type BatchVerificationResponse,
  type PublicError,
  type UploadedImage,
  type VerificationOutcome,
  type VerificationUnavailable,
} from "../dtos/VerificationDto.js";
import { compareLabel } from "../domain/comparison.js";
import { InputError, ProviderUnavailableError } from "../errors/index.js";
import type { LabelExtractionRepository } from "../repositories/LabelExtractionRepository.js";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_BATCH_ITEMS = 5;
export const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function safeFilename(filename: string): string {
  const base = path.basename(filename).trim();
  return (base || "label-image").slice(0, 255);
}

function unavailable(
  referenceId: string,
  filename: string,
  error: PublicError,
  processingMs: number,
): VerificationUnavailable {
  return {
    outcome: "UNABLE_TO_VERIFY",
    referenceId,
    filename: safeFilename(filename),
    error,
    processingMs,
  };
}

export class VerificationService {
  constructor(
    private readonly extractionRepository: LabelExtractionRepository,
    private readonly providerTimeoutMs = 4_200,
  ) {}

  private async preprocess(image: UploadedImage) {
    if (!SUPPORTED_IMAGE_TYPES.has(image.mimeType)) {
      throw new InputError(
        "UNSUPPORTED_IMAGE_TYPE",
        "Upload a JPEG, PNG, or WebP image.",
        415,
        "image",
      );
    }
    if (!image.buffer.length) {
      throw new InputError("EMPTY_IMAGE", "The selected image is empty.", 400, "image");
    }
    if (image.buffer.length > MAX_IMAGE_BYTES) {
      throw new InputError(
        "IMAGE_TOO_LARGE",
        "Use an image no larger than 15 MiB.",
        413,
        "image",
      );
    }
    try {
      const bytes = await sharp(image.buffer, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({
          width: 1_600,
          height: 1_600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      return {
        bytes,
        filename: safeFilename(image.filename),
        mimeType: "image/jpeg" as const,
      };
    } catch {
      throw new InputError(
        "INVALID_IMAGE",
        "The image could not be read. Choose a valid JPEG, PNG, or WebP image.",
        400,
        "image",
      );
    }
  }

  async verify(application: ApplicationInput, image: UploadedImage): Promise<VerificationOutcome> {
    const startedAt = performance.now();
    const filename = safeFilename(image.filename);
    const processed = await this.preprocess(image);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.providerTimeoutMs);
    try {
      const extracted = await this.extractionRepository.extract(processed, controller.signal);
      const processingMs = elapsedMs(startedAt);
      if (!extracted.imageUsable) {
        return unavailable(
          application.referenceId,
          filename,
          {
            code: "IMAGE_UNUSABLE",
            message: "The image is not clear or complete enough to review.",
            field: "image",
            retryable: false,
          },
          processingMs,
        );
      }
      return compareLabel(application, extracted, filename, processingMs);
    } catch (error) {
      const providerError = error instanceof ProviderUnavailableError
        ? error
        : new ProviderUnavailableError(
            "EXTRACTION_UNAVAILABLE",
            "The label reader is temporarily unavailable.",
          );
      return unavailable(
        application.referenceId,
        filename,
        {
          code: providerError.code,
          message: providerError.message,
          retryable: providerError.retryable,
        },
        elapsedMs(startedAt),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyBatch(
    applications: unknown[],
    images: UploadedImage[],
  ): Promise<BatchVerificationResponse> {
    const startedAt = performance.now();
    const items = await Promise.all(
      applications.map(async (rawApplication, index) => {
        const application = ApplicationInputSchema.safeParse(rawApplication);
        const image = images[index]!;
        if (!application.success) {
          const referenceId = typeof rawApplication === "object" && rawApplication !== null && "referenceId" in rawApplication
            ? String(rawApplication.referenceId).slice(0, 128)
            : `row-${index + 1}`;
          return {
            index,
            result: unavailable(
              referenceId,
              image?.filename ?? `image-${index + 1}`,
              {
                code: "INVALID_APPLICATION",
                message: "Application data is missing or invalid.",
                field: `applications[${index}]`,
                retryable: false,
              },
              0,
            ),
          };
        }
        try {
          return { index, result: await this.verify(application.data, image) };
        } catch (error) {
          if (error instanceof InputError) {
            return {
              index,
              result: unavailable(
                application.data.referenceId,
                image.filename,
                {
                  code: error.code,
                  message: error.message,
                  field: error.field ? `images[${index}]` : undefined,
                  retryable: false,
                },
                0,
              ),
            };
          }
          throw error;
        }
      }),
    );
    const outcomes = items.map((item) => item.result);
    return {
      summary: {
        matched: outcomes.filter((result) => result.outcome === "MATCH").length,
        needsReview: outcomes.filter((result) => result.outcome === "NEEDS_REVIEW").length,
        unableToVerify: outcomes.filter((result) => result.outcome === "UNABLE_TO_VERIFY").length,
        total: outcomes.length,
      },
      items,
      processingMs: elapsedMs(startedAt),
    };
  }
}
