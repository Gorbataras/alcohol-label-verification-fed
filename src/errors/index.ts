export class InputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 413 | 415 | 422,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "InputError";
  }
}

export class RequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 413 | 415 | 422,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
