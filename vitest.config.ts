import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    reporters: ["verbose"],
    env: { NODE_ENV: "test" },
    coverage: { reporter: ["text", "html"] },
  },
});
