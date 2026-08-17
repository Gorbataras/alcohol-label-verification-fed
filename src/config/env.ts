function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  port: number;
  ocrProvider: "openai" | "fake";
  openAiApiKey?: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  rateLimitPerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveInteger(env.PORT, 3_000),
    ocrProvider: env.OCR_PROVIDER === "fake" ? "fake" : "openai",
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    openAiModel: env.OPENAI_MODEL?.trim() || "gpt-5.4-nano",
    openAiTimeoutMs: positiveInteger(env.OPENAI_TIMEOUT_MS, 4_200),
    rateLimitPerMinute: positiveInteger(env.RATE_LIMIT_PER_MINUTE, 60),
  };
}
