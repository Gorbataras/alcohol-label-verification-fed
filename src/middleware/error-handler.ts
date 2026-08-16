import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { InputError, RequestError } from "../errors/index.js";

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  field?: string,
  retryable = false,
): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(field ? { field } : {}),
      retryable,
    },
  });
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      sendError(res, 413, "IMAGE_TOO_LARGE", "Use images no larger than 15 MiB.", err.field);
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      sendError(res, 422, "BATCH_SIZE_EXCEEDED", "Use no more than five labels in one API batch.", err.field);
      return;
    }
    sendError(res, 400, "INVALID_MULTIPART", "The upload could not be read.", err.field);
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.length ? first.path.join(".") : undefined;
    sendError(res, 422, "INVALID_APPLICATION", first?.message ?? "Application data is invalid.", field);
    return;
  }

  if (err instanceof InputError || err instanceof RequestError) {
    sendError(res, err.status, err.code, err.message, err.field);
    return;
  }

  console.error("Unexpected request failure", { errorType: err.name });
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.", undefined, true);
};
