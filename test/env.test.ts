import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("defaults the verification rate limit to 10 requests per minute", () => {
    expect(loadConfig({}).rateLimitPerMinute).toBe(10);
  });
});
