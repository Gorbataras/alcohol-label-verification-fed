export interface ApplicationInput {
  referenceId: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producerNameAddress: string;
  countryOfOrigin?: string;
}

export type Outcome = "MATCH" | "NEEDS_REVIEW" | "UNABLE_TO_VERIFY";

export interface PublicError {
  code: string;
  message: string;
  field?: string;
  retryable: boolean;
}

export interface FieldCheck {
  field: string;
  status: "MATCH" | "MISMATCH" | "NOT_FOUND" | "NOT_APPLICABLE" | "UNCERTAIN";
  expected: string | null;
  observed: string | null;
  score: number | null;
  confidence: number;
  detail: string;
}

export interface WarningCheck {
  check: string;
  status: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNCERTAIN";
  expected: string | boolean;
  observed: string | boolean | null;
  confidence: number;
  detail: string;
}

export interface VerificationSuccess {
  outcome: "MATCH" | "NEEDS_REVIEW";
  referenceId: string;
  filename: string;
  fields: FieldCheck[];
  warningChecks: WarningCheck[];
  processingMs: number;
}

export interface VerificationUnavailable {
  outcome: "UNABLE_TO_VERIFY";
  referenceId: string;
  filename: string;
  error: PublicError;
  processingMs: number;
}

export type VerificationOutcome = VerificationSuccess | VerificationUnavailable;

export interface BatchVerificationResponse {
  summary: {
    matched: number;
    needsReview: number;
    unableToVerify: number;
    total: number;
  };
  items: Array<{ index: number; result: VerificationOutcome }>;
  processingMs: number;
}

export interface BatchEntry {
  application: ApplicationInput;
  image: File;
}

export interface SubmittedApplication {
  application: ApplicationInput;
  imageFilename: string;
  imageUrl: string;
  title: string;
}
