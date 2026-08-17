import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ExtractedLabelSchema,
  type ExtractedLabel,
} from "../dtos/VerificationDto.js";
import { ProviderUnavailableError } from "../errors/index.js";
import type {
  LabelExtractionRepository,
  ProcessedLabelImage,
} from "./LabelExtractionRepository.js";

interface ParsedResponse {
  output_parsed: unknown;
}

interface ResponsesClient {
  responses: {
    parse(params: unknown, options?: { signal?: AbortSignal }): Promise<ParsedResponse>;
  };
}

const EXTRACTION_PROMPT = `Read this distilled-spirits label as a conservative compliance assistant.
Return only information that is visibly present. Use null for any text or formatting fact that is
uncertain, cropped, illegible, obscured, or inferred. Never repair, paraphrase, or invent warning
text.

For producerNameAddress, return only the producer entity name and its address. Omit role labels
such as "Distilled by", "Bottled by", or "Produced by", and omit separate country-of-origin text.
For countryOfOrigin, return only the country name or country code. Omit introductory wording such
as "Product of", "Made in", or "Country of origin".

governmentWarningText must include the visible "GOVERNMENT WARNING:" heading followed by both
numbered statements. Preserve its exact capitalization, punctuation, and wording. Return null if
any part of the heading or either numbered statement is unreadable.

For warning formatting, inspect the visible label and report whether the heading is uppercase and
bold, the body is not bold, the statement is separate from other information, and it is presented
as one continuous paragraph. Normal visual line wrapping within a single paragraph still counts as
continuous; report false only for distinct blocks, columns, bullets, or interruptions by unrelated
text. Separation is satisfied when whitespace, a border, or placement clearly sets the complete
warning apart from unrelated text; a distinct enclosing box counts as separation. Judge boldness
by visible relative font weight: a clearly heavier heading is bold and a
regular-weight body is not bold. Use null only when image quality makes the weight indistinguishable.
imageUsable is false only when the image cannot support meaningful label review at all.`;

export interface OpenAiRepositoryOptions {
  apiKey?: string;
  model?: string;
  client?: ResponsesClient;
}

export class OpenAiLabelExtractionRepository implements LabelExtractionRepository {
  private readonly apiKey?: string;
  private readonly model: string;
  private client?: ResponsesClient;

  constructor(options: OpenAiRepositoryOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.4-nano";
    this.client = options.client;
  }

  private getClient(): ResponsesClient {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new ProviderUnavailableError(
        "OPENAI_API_KEY_MISSING",
        "Label extraction is not configured. Set OPENAI_API_KEY and try again.",
        false,
      );
    }
    this.client = new OpenAI({ apiKey: this.apiKey, maxRetries: 0 }) as unknown as ResponsesClient;
    return this.client;
  }

  async extract(image: ProcessedLabelImage, signal: AbortSignal): Promise<ExtractedLabel> {
    if (signal.aborted) {
      throw new ProviderUnavailableError("EXTRACTION_TIMEOUT", "Label extraction timed out.");
    }
    try {
      const response = await this.getClient().responses.parse(
        {
          model: this.model,
          store: false,
          reasoning: { effort: "none" },
          input: [
            { role: "system", content: EXTRACTION_PROMPT },
            {
              role: "user",
              content: [
                { type: "input_text", text: "Extract the visible label fields and warning-format facts." },
                {
                  type: "input_image",
                  image_url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
                  detail: "original",
                },
              ],
            },
          ],
          text: { format: zodTextFormat(ExtractedLabelSchema, "distilled_spirits_label") },
        },
        { signal },
      );
      const parsed = ExtractedLabelSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        throw new ProviderUnavailableError(
          "INVALID_PROVIDER_RESPONSE",
          "The label reader returned an invalid result.",
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new ProviderUnavailableError("EXTRACTION_TIMEOUT", "Label extraction timed out.");
      }
      throw new ProviderUnavailableError(
        "EXTRACTION_UNAVAILABLE",
        "The label reader is temporarily unavailable.",
      );
    }
  }
}
