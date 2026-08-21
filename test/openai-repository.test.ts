import { describe, expect, it, vi } from "vitest";
import { OpenAiLabelExtractionRepository } from "../src/repositories/OpenAiLabelExtractionRepository.js";
import { extractedLabel } from "./helpers.js";

const image = { bytes: Buffer.from("jpeg"), filename: "label.jpg", mimeType: "image/jpeg" as const };

describe("OpenAiLabelExtractionRepository", () => {
  it("uses structured Responses API image input and validates parsed output", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: extractedLabel() });
    const repository = new OpenAiLabelExtractionRepository({
      model: "gpt-5.4-nano",
      client: { responses: { parse } },
    });
    const result = await repository.extract(image, new AbortController().signal);
    expect(result.brandName).toBe("Old Tom Distillery");
    const params = parse.mock.calls[0]?.[0] as any;
    expect(params).toMatchObject({ model: "gpt-5.4-nano", store: false, reasoning: { effort: "none" } });
    expect(params.input[0].content).toContain("For producerNameAddress, return only");
    expect(params.input[0].content).toContain("continue across adjacent lines");
    expect(params.input[0].content).toContain("omit only the country clause");
    expect(params.input[0].content).toContain("For countryOfOrigin, return only");
    expect(params.input[0].content).toContain("must include the visible \"GOVERNMENT WARNING:\"");
    expect(params.input[0].content).toContain("heading and both numbered statements form one running block");
    expect(params.input[0].content).toContain("Do not use null because the text wraps");
    expect(params.input[0].content).toContain("give it high confidence (0.9 or above)");
    expect(params.input[0].content).toContain("Wrapping is not ambiguity");
    expect(params.input[0].content).toContain("a distinct enclosing box counts as separation");
    expect(params.input[0].content).toContain("visible relative font weight");
    expect(params.input[0].content).toContain("it is not a compliance score");
    expect(params.input[1].content[1]).toMatchObject({ type: "input_image", detail: "original" });
    expect(params.input[1].content[1].image_url).toContain("data:image/jpeg;base64,");
  });

  it("fails cleanly when the key is missing", async () => {
    const repository = new OpenAiLabelExtractionRepository();
    await expect(repository.extract(image, new AbortController().signal)).rejects.toMatchObject({
      code: "OPENAI_API_KEY_MISSING",
      retryable: false,
    });
  });

  it("rejects invalid structured output and sanitizes provider errors", async () => {
    const invalid = new OpenAiLabelExtractionRepository({
      client: { responses: { parse: vi.fn().mockResolvedValue({ output_parsed: { brandName: "partial" } }) } },
    });
    await expect(invalid.extract(image, new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });

    const failed = new OpenAiLabelExtractionRepository({
      client: { responses: { parse: vi.fn().mockRejectedValue(new Error("secret upstream detail")) } },
    });
    await expect(failed.extract(image, new AbortController().signal)).rejects.toMatchObject({
      code: "EXTRACTION_UNAVAILABLE",
      message: "The label reader is temporarily unavailable.",
    });
  });

  it("treats a refusal as an invalid structured response", async () => {
    const repository = new OpenAiLabelExtractionRepository({
      client: { responses: { parse: vi.fn().mockResolvedValue({ output_parsed: null }) } },
    });
    await expect(repository.extract(image, new AbortController().signal)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
      message: "The label reader returned an invalid result.",
    });
  });

  it("honors an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const repository = new OpenAiLabelExtractionRepository({
      client: { responses: { parse: vi.fn() } },
    });
    await expect(repository.extract(image, controller.signal)).rejects.toMatchObject({ code: "EXTRACTION_TIMEOUT" });
  });

});
