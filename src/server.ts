import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { FakeLabelExtractionRepository } from "./repositories/FakeLabelExtractionRepository.js";
import { OpenAiLabelExtractionRepository } from "./repositories/OpenAiLabelExtractionRepository.js";

const config = loadConfig();
const repository = config.ocrProvider === "fake"
  ? new FakeLabelExtractionRepository()
  : new OpenAiLabelExtractionRepository({
      apiKey: config.openAiApiKey,
      model: config.openAiModel,
    });

const app = buildApp(repository, {
  providerTimeoutMs: config.openAiTimeoutMs,
  rateLimit: {
    windowMs: 60_000,
    limit: config.rateLimitPerMinute,
  },
});

app.listen(config.port, () => {
  console.log(`\nDistilled-Spirits Label Verification listening on http://localhost:${config.port}`);
  console.log("  POST /api/v1/verifications");
  console.log("  POST /api/v1/verifications/batch");
  console.log("  GET  /health");
  console.log("  GET  /docs\n");
});
