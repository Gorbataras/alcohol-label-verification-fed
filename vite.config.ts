import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  publicDir: "../fixtures",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/openapi.json": "http://localhost:3000",
      "/docs": "http://localhost:3000",
    },
  },
});
