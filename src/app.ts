import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { mountOpenApi } from "./config/openapi.js";
import { errorHandler } from "./middleware/error-handler.js";
import type { LabelExtractionRepository } from "./repositories/LabelExtractionRepository.js";
import { verificationRouter } from "./routes/VerificationRoutes.js";

export interface BuildAppOptions {
  providerTimeoutMs?: number;
  rateLimit?: false | { windowMs: number; limit: number };
  staticDirectory?: string;
}

export function buildApp(
  repository: LabelExtractionRepository,
  options: BuildAppOptions = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use((req: Request, res: Response, next) => {
      const startedAt = performance.now();
      const requestPath = req.path;
      res.on("finish", () => {
        const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
        console.log(`${req.method} ${requestPath} ${res.statusCode} ${durationMs}ms`);
      });
      next();
    });
  }

  const limiter = options.rateLimit === false
    ? null
    : rateLimit({
        windowMs: options.rateLimit?.windowMs ?? 60_000,
        limit: options.rateLimit?.limit ?? 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, res) => {
          res.status(429).json({
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many labels have been submitted. Wait a minute and try again.",
              retryable: true,
            },
          });
        },
      });

  const router = verificationRouter(repository, options.providerTimeoutMs);
  if (limiter) app.use("/api/v1/verifications", limiter, router);
  else app.use("/api/v1/verifications", router);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  mountOpenApi(app);

  const staticDirectory = options.staticDirectory ?? path.resolve(process.cwd(), "dist/client");
  if (existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory));
    app.get("/", (_req, res) => res.sendFile(path.join(staticDirectory, "index.html")));
  } else {
    app.get("/", (_req, res) => {
      res.json({
        name: "Distilled-Spirits Label Verification API",
        docs: "/docs",
        note: "Run npm run dev for the browser interface.",
      });
    });
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource does not exist.",
        retryable: false,
      },
    });
  });

  app.use(errorHandler);
  return app;
}
