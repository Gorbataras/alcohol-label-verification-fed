import { Router } from "express";
import multer from "multer";
import { VerificationController } from "../controllers/VerificationController.js";
import type { LabelExtractionRepository } from "../repositories/LabelExtractionRepository.js";
import {
  MAX_BATCH_ITEMS,
  MAX_IMAGE_BYTES,
  VerificationService,
} from "../services/VerificationService.js";

export function verificationRouter(
  repository: LabelExtractionRepository,
  providerTimeoutMs = 4_200,
): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: MAX_BATCH_ITEMS,
      fields: 2,
    },
  });
  const service = new VerificationService(repository, providerTimeoutMs);
  const controller = new VerificationController(service);

  router.post("/", upload.single("image"), controller.verifySingle);
  router.post("/batch", upload.array("images", MAX_BATCH_ITEMS), controller.verifyBatch);

  return router;
}
