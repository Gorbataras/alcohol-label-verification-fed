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
  headingIsBold: z.boolean().nullable(),
  bodyIsNotBold: z.boolean().nullable(),
  separateFromOtherText: z.boolean().nullable(),
  continuousParagraph: z.boolean().nullable(),
});

export const ExtractedLabelSchema = z.object({
  imageUsable: z.boolean(),
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholContent: z.string().nullable(),
  netContents: z.string().nullable(),
  producerNameAddress: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  governmentWarningText: z.string().nullable(),
  warningFormat: WarningFormatSchema,
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
