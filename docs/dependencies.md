# Direct dependency rationale

This project keeps a deliberately small direct dependency surface. Every package below has a specific responsibility; packages are not included for speculative future use. Exact resolved versions and transitive dependencies are recorded in `package-lock.json` after installation.

## Runtime dependencies

| Package | Why it is used | Where it is used |
|---|---|---|
| `express` | Provides the Express 5 HTTP server, routers, middleware pipeline, static client hosting, and automatic forwarding of rejected async handlers to the final error handler. | `src/app.ts`, routes, controllers, server composition |
| `zod` | Defines one runtime-validated contract for application input, extracted OpenAI output, API responses, and TypeScript inference. It prevents malformed model output from reaching comparison logic. | `src/dtos/VerificationDto.ts`, controllers, repository, OpenAPI generation |
| `openai` | Provides the supported TypeScript client for server-side Responses API calls, image input, abort signals, zero-retry configuration, and Zod structured-output parsing. The key remains server-only. | `src/repositories/OpenAiLabelExtractionRepository.ts` |
| `sharp` | Safely decodes uploads, enforces a pixel ceiling, applies EXIF orientation, resizes without enlarging, flattens transparency, and emits a predictable JPEG before vision extraction. This reduces payload size and avoids sending corrupt or unexpectedly huge images upstream. | `src/services/VerificationService.ts`, fixture generator |
| `multer` | Parses `multipart/form-data` directly into memory and applies file count/size limits for the single and batch image endpoints. No uploaded file is written to disk. | `src/routes/VerificationRoutes.ts`, error handler |
| `express-rate-limit` | Supplies bounded, standards-header-aware, per-process abuse protection without introducing Redis or a database. This is appropriate for the single-container prototype. | `src/app.ts` |
| `@asteasolutions/zod-to-openapi` | Generates OpenAPI schemas from the same Zod contracts that validate the running API, avoiding a second contract that can drift. | `src/config/openapi.ts` |
| `@scalar/express-api-reference` | Renders the generated OpenAPI document as an interactive, locally served `/docs` page. It does not send application data to a third-party service. | `src/config/openapi.ts` |

## Development-only dependencies

| Package | Why it is used |
|---|---|
| `typescript` | Enforces strict compile-time checks across the server, browser code, scripts, and tests. |
| `tsx` | Runs TypeScript directly for the development server, watch mode, and fixture-generation script. |
| `vite` | Bundles the Vanilla TypeScript browser application and provides the local UI server/API proxy. |
| `vitest` | Runs the unit, service, provider, HTTP contract, browser orchestration, and UI tests. |
| `supertest` | Exercises the real Express middleware and multipart endpoints in memory without opening a network port. |
| `jsdom` | Provides a browser-like DOM for UI behavior and accessibility tests under Vitest. |
| `axe-core` | Performs automated accessibility checks on the initial application document. It supplements, but does not replace, keyboard and assistive-technology review. |
| `concurrently` | Starts the Express and Vite development processes together and stops both when one is terminated. It is not included in the production image. |
| `@types/express` | Adds TypeScript declarations for Express request, response, router, and error middleware APIs. |
| `@types/multer` | Adds declarations for in-memory uploaded files and multipart middleware. |
| `@types/node` | Adds declarations for Node.js buffers, paths, environment variables, and filesystem APIs. |
| `@types/supertest` | Adds declarations for the HTTP test client. |

## Packages intentionally not used

- No database, ORM, Redis, queue, or object-storage client: server-side retention is out of scope.
- No authentication library: the approved prototype has no user accounts or authorization boundary.
- No React or component framework: semantic HTML and small TypeScript modules are sufficient for the interface.
- No telemetry or analytics SDK: images, extracted text, and application values must not leak through third-party instrumentation.
- No separate fuzzy-matching library: the small normalized Levenshtein/token-order comparator is implemented and tested locally.

## Supply-chain and install notes

- `package-lock.json` is committed so CI and Docker use reproducible versions through `npm ci`.
- Runtime Docker installation uses `npm ci --omit=dev`, excluding all development-only packages.
- `sharp` resolves a platform-specific optional binary package, while Vite's transitive `esbuild` package runs an install script to validate its platform binary. Only `esbuild@0.28.2` is script-approved in `package.json`; the optional `fsevents` script remains blocked because the application does not require its native macOS watcher.
- Transitive dependencies are accepted only through these documented direct packages and can be reviewed with `npm audit` and `npm ls` after installation.
