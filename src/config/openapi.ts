import { apiReference } from "@scalar/express-api-reference";
import {
  extendZodWithOpenApi,
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import type { Express } from "express";
import { z } from "zod";
import {
  BatchVerificationResponseSchema,
  ErrorResponseSchema,
  VerificationOutcomeSchema,
} from "../dtos/VerificationDto.js";

extendZodWithOpenApi(z);

// zod v4 concrete schemas do not all inherit the patched prototype.
{
  const openapi = (z.ZodType as any).prototype.openapi as unknown;
  if (typeof openapi === "function") {
    for (const key of Object.keys(z)) {
      const schemaClass = (z as any)[key];
      if (
        key.startsWith("Zod") &&
        key !== "ZodType" &&
        schemaClass?.prototype &&
        typeof schemaClass.prototype.openapi === "undefined"
      ) {
        schemaClass.prototype.openapi = openapi;
      }
    }
  }
}

const registry = new OpenAPIRegistry();
const ErrorSchema = registry.register("ErrorResponse", ErrorResponseSchema);
const OutcomeSchema = registry.register("VerificationOutcome", VerificationOutcomeSchema);
const BatchSchema = registry.register("BatchVerificationResponse", BatchVerificationResponseSchema);

const ApplicationJsonExample = JSON.stringify({
  referenceId: "COLA-1001",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
  countryOfOrigin: "United States",
});

registry.registerPath({
  method: "post",
  path: "/api/v1/verifications",
  summary: "Verify one distilled-spirits label",
  tags: ["Verifications"],
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            image: z.string().openapi({ format: "binary" }),
            application: z.string().openapi({ example: ApplicationJsonExample }),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Label reviewed", content: { "application/json": { schema: OutcomeSchema } } },
    400: { description: "Malformed request", content: { "application/json": { schema: ErrorSchema } } },
    413: { description: "Image too large", content: { "application/json": { schema: ErrorSchema } } },
    415: { description: "Unsupported image type", content: { "application/json": { schema: ErrorSchema } } },
    422: { description: "Invalid application", content: { "application/json": { schema: ErrorSchema } } },
    429: { description: "Rate limit exceeded", content: { "application/json": { schema: ErrorSchema } } },
    503: { description: "Extraction unavailable", content: { "application/json": { schema: OutcomeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/verifications/batch",
  summary: "Verify up to five labels concurrently",
  tags: ["Verifications"],
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            images: z.array(z.string().openapi({ format: "binary" })).min(1).max(5),
            applications: z.string().openapi({ example: `[${ApplicationJsonExample}]` }),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Batch reviewed", content: { "application/json": { schema: BatchSchema } } },
    400: { description: "Malformed request", content: { "application/json": { schema: ErrorSchema } } },
    413: { description: "Image too large", content: { "application/json": { schema: ErrorSchema } } },
    422: { description: "Invalid batch structure", content: { "application/json": { schema: ErrorSchema } } },
    429: { description: "Rate limit exceeded", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "Service health",
  tags: ["System"],
  responses: {
    200: {
      description: "Healthy",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
  },
});

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Distilled-Spirits Label Verification API",
    version: "1.0.0",
    description: "Decision-support API. A compliance agent makes the final determination.",
  },
});

export function mountOpenApi(app: Express): void {
  app.get("/openapi.json", (_req, res) => res.json(document));
  app.use("/docs", apiReference({ url: "/openapi.json" }));
}

export { document as openApiDocument };
