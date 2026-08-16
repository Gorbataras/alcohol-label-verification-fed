import type {
  ApplicationInput,
  BatchEntry,
  BatchVerificationResponse,
  PublicError,
  VerificationOutcome,
} from "./types.js";

export class ApiError extends Error {
  constructor(public readonly detail: PublicError, public readonly status: number) {
    super(detail.message);
    this.name = "ApiError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { error?: PublicError } | T | null;
  if (!response.ok) {
    if (payload && typeof payload === "object" && "outcome" in payload) return payload as T;
    const detail = payload && typeof payload === "object" && "error" in payload && payload.error
      ? payload.error
      : { code: "REQUEST_FAILED", message: "The request could not be completed.", retryable: true };
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

export async function verifySingle(
  application: ApplicationInput,
  image: File,
  signal?: AbortSignal,
): Promise<VerificationOutcome> {
  const form = new FormData();
  form.append("image", image, image.name);
  form.append("application", JSON.stringify(application));
  return readResponse<VerificationOutcome>(
    await fetch("/api/v1/verifications", { method: "POST", body: form, signal }),
  );
}

export async function verifyChunk(
  entries: BatchEntry[],
  signal?: AbortSignal,
): Promise<BatchVerificationResponse> {
  const form = new FormData();
  entries.forEach((entry) => form.append("images", entry.image, entry.image.name));
  form.append("applications", JSON.stringify(entries.map((entry) => entry.application)));
  return readResponse<BatchVerificationResponse>(
    await fetch("/api/v1/verifications/batch", { method: "POST", body: form, signal }),
  );
}
