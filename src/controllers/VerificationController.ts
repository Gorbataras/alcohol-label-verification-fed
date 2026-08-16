import type { Request, Response } from "express";
import { ApplicationInputSchema, type UploadedImage } from "../dtos/VerificationDto.js";
import { RequestError } from "../errors/index.js";
import { MAX_BATCH_ITEMS, VerificationService } from "../services/VerificationService.js";

function parseJsonField(value: unknown, field: string): unknown {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(
      field === "application" ? "MISSING_APPLICATION" : "MISSING_BATCH_APPLICATIONS",
      field === "application"
        ? "Provide application data for the label."
        : "Provide application data for every label in the batch.",
      422,
      field,
    );
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestError(
      field === "application" ? "INVALID_APPLICATION_JSON" : "INVALID_BATCH_JSON",
      field === "application"
        ? "Application data must be valid JSON."
        : "Batch application data must be a valid JSON array.",
      400,
      field,
    );
  }
}

function toUploadedImage(file: Express.Multer.File): UploadedImage {
  return {
    buffer: file.buffer,
    filename: file.originalname,
    mimeType: file.mimetype.split(";", 1)[0]!.trim().toLocaleLowerCase("en-US"),
  };
}

export class VerificationController {
  constructor(private readonly service: VerificationService) {}

  verifySingle = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new RequestError("MISSING_IMAGE", "Choose a label image.", 422, "image");
    }
    const application = ApplicationInputSchema.parse(parseJsonField(req.body.application, "application"));
    const result = await this.service.verify(application, toUploadedImage(req.file));
    res.status(result.outcome === "UNABLE_TO_VERIFY" ? 503 : 200).json(result);
  };

  verifyBatch = async (req: Request, res: Response): Promise<void> => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      throw new RequestError("MISSING_IMAGES", "Choose at least one label image.", 422, "images");
    }
    const applications = parseJsonField(req.body.applications, "applications");
    if (!Array.isArray(applications)) {
      throw new RequestError(
        "INVALID_BATCH_APPLICATIONS",
        "Batch application data must be a JSON array.",
        422,
        "applications",
      );
    }
    if (!applications.length || applications.length > MAX_BATCH_ITEMS) {
      throw new RequestError(
        applications.length ? "BATCH_SIZE_EXCEEDED" : "EMPTY_BATCH",
        applications.length ? "Use no more than five labels in one API batch." : "Add at least one label to the batch.",
        422,
        "applications",
      );
    }
    if (files.length !== applications.length) {
      throw new RequestError(
        "BATCH_PAIR_COUNT_MISMATCH",
        "Provide exactly one image for each application in the batch.",
        422,
      );
    }
    const result = await this.service.verifyBatch(applications, files.map(toUploadedImage));
    res.json(result);
  };
}
