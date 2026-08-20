import { z } from "zod";

const RequiredText = z.string().trim().min(1).max(1_000);

export const ApplicationInputSchema = z.object({
  referenceId: z.string().trim().min(1).max(128),
  brandName: RequiredText,
  classType: RequiredText,
  alcoholContent: RequiredText,
  netContents: RequiredText,
  producerNameAddress: RequiredText,
  countryOfOrigin: z.string().trim().max(200).optional(),
});
export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;

export const WarningFormatSchema = z.object({
  headingIsUppercase: z.boolean().nullable(),
  headingIsBold: z
    .boolean()
    .nullable()
    .describe("True when the warning heading has a visibly heavier font weight than the body."),
  bodyIsNotBold: z
    .boolean()
    .nullable()
    .describe("True when the warning body uses a visibly regular, non-bold font weight."),
  separateFromOtherText: z
    .boolean()
    .nullable()
    .describe(
      "True when whitespace, a border, or placement sets the complete warning apart; a distinct enclosing box counts.",
    ),
  continuousParagraph: z
    .boolean()
    .nullable()
    .describe(
      "True when the warning is one continuous paragraph; normal visual line wrapping does not make it false.",
  ),
});

const ConfidenceSchema = z.number().min(0).max(1);

export const ExtractionConfidenceSchema = z.object({
  brandName: ConfidenceSchema,
  classType: ConfidenceSchema,
  alcoholContent: ConfidenceSchema,
  netContents: ConfidenceSchema,
  producerNameAddress: ConfidenceSchema,
  countryOfOrigin: ConfidenceSchema,
  governmentWarningText: ConfidenceSchema,
  warningFormat: z.object({
    headingIsUppercase: ConfidenceSchema,
    headingIsBold: ConfidenceSchema,
    bodyIsNotBold: ConfidenceSchema,
    separateFromOtherText: ConfidenceSchema,
    continuousParagraph: ConfidenceSchema,
  }),
});
export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;

export const ExtractedLabelSchema = z.object({
  imageUsable: z.boolean(),
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholContent: z.string().nullable(),
  netContents: z.string().nullable(),
  producerNameAddress: z
    .string()
    .nullable()
    .describe(
      "Producer entity name and address only; exclude role labels and separate country-of-origin wording.",
    ),
  countryOfOrigin: z
    .string()
    .nullable()
    .describe(
      "Country name or code only when explicitly visible; exclude introductions such as Product of or Made in.",
    ),
  governmentWarningText: z
    .string()
    .nullable()
    .describe(
      "Exact visible warning including the GOVERNMENT WARNING: heading and both numbered statements.",
    ),
  warningFormat: WarningFormatSchema,
  confidence: ExtractionConfidenceSchema.describe(
    "Visual extraction certainty for each value or formatting observation. This is not a compliance score.",
  ),
});
export type ExtractedLabel = z.infer<typeof ExtractedLabelSchema>;

export const FieldNameSchema = z.enum([
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerNameAddress",
  "countryOfOrigin",
]);
export type FieldName = z.infer<typeof FieldNameSchema>;

export const FieldStatusSchema = z.enum([
  "MATCH",
  "MISMATCH",
  "NOT_FOUND",
  "NOT_APPLICABLE",
  "UNCERTAIN",
]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const FieldCheckSchema = z.object({
  field: FieldNameSchema,
  status: FieldStatusSchema,
  expected: z.string().nullable(),
  observed: z.string().nullable(),
  score: z.number().min(0).max(1).nullable(),
  confidence: ConfidenceSchema.describe("Visual certainty of the extracted label value."),
  detail: z.string(),
});
export type FieldCheck = z.infer<typeof FieldCheckSchema>;

export const WarningCheckNameSchema = z.enum([
  "text",
  "headingUppercase",
  "headingBold",
  "bodyNotBold",
  "separateFromOtherText",
  "continuousParagraph",
]);

export const WarningCheckSchema = z.object({
  check: WarningCheckNameSchema,
  status: z.enum(["MATCH", "MISMATCH", "NOT_FOUND", "UNCERTAIN"]),
  expected: z.union([z.string(), z.boolean()]),
  observed: z.union([z.string(), z.boolean()]).nullable(),
  confidence: ConfidenceSchema.describe("Visual certainty of the extracted warning observation."),
  detail: z.string(),
});
export type WarningCheck = z.infer<typeof WarningCheckSchema>;

export const PublicErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  retryable: z.boolean(),
});
export type PublicError = z.infer<typeof PublicErrorSchema>;

export const ErrorResponseSchema = z.object({ error: PublicErrorSchema });

export const VerificationSuccessSchema = z.object({
  outcome: z.enum(["MATCH", "NEEDS_REVIEW"]),
  referenceId: z.string(),
  filename: z.string(),
  fields: z.array(FieldCheckSchema).length(6),
  warningChecks: z.array(WarningCheckSchema).length(6),
  processingMs: z.number().nonnegative(),
});
export type VerificationSuccess = z.infer<typeof VerificationSuccessSchema>;

export const VerificationUnavailableSchema = z.object({
  outcome: z.literal("UNABLE_TO_VERIFY"),
  referenceId: z.string(),
  filename: z.string(),
  error: PublicErrorSchema,
  processingMs: z.number().nonnegative(),
});
export type VerificationUnavailable = z.infer<typeof VerificationUnavailableSchema>;

export const VerificationOutcomeSchema = z.discriminatedUnion("outcome", [
  VerificationSuccessSchema,
  VerificationUnavailableSchema,
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

export const BatchItemSchema = z.object({
  index: z.number().int().min(0).max(4),
  result: VerificationOutcomeSchema,
});

export const BatchVerificationResponseSchema = z.object({
  summary: z.object({
    matched: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    unableToVerify: z.number().int().nonnegative(),
    total: z.number().int().min(1).max(5),
  }),
  items: z.array(BatchItemSchema).min(1).max(5),
  processingMs: z.number().nonnegative(),
});
export type BatchVerificationResponse = z.infer<typeof BatchVerificationResponseSchema>;

export interface UploadedImage {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}
