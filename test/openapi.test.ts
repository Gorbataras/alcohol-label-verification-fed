import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/config/openapi.js";

describe("OpenAPI document", () => {
  it("documents the system and multipart verification endpoints", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.paths).toHaveProperty("/health");
    expect(openApiDocument.paths).toHaveProperty("/api/v1/verifications.post");
    expect(openApiDocument.paths).toHaveProperty("/api/v1/verifications/batch.post");
    const single = openApiDocument.paths?.["/api/v1/verifications"]?.post;
    expect(single?.requestBody).toBeDefined();
    expect(single?.responses).toHaveProperty("503");
  });
});
