# Distilled-Spirits Label Verification

A standalone decision-support prototype for comparing a distilled-spirits label image with application values. It reviews brand name, class/type, alcohol content, net contents, producer name/address, optional country of origin, and the required government warning text and selected formatting rules.

The result is `MATCH`, `NEEDS_REVIEW`, or `UNABLE_TO_VERIFY`. A compliance agent always makes the final decision.

## Architecture

The Express 5 + TypeScript backend follows one-way layering:

```text
routes → controllers → services → LabelExtractionRepository
                                      ├─ OpenAI Responses API
                                      └─ deterministic fake
```

Services contain image preprocessing and deterministic comparison logic and never import Express request/response types. The concrete extraction repository is selected only in `src/server.ts`. There is no database, Redis, authentication, or server-side document retention.

The same-origin Vanilla TypeScript/Vite interface supports a single form and CSV-driven browser batches of up to 300 labels. The browser sends API chunks of five with two chunks in flight, keeps files/results only in the current tab, and exports results as CSV.

See [docs/dependencies.md](docs/dependencies.md) for the purpose, usage location, and tradeoffs of every direct runtime and development dependency.

## Requirements and setup

- Node.js 24+
- npm
- Docker 29+ (optional)
- An OpenAI API key for real label extraction

```bash
npm install
cp .env.example .env
# Set OPENAI_API_KEY in .env, or use OCR_PROVIDER=fake for local UI/API checks.
npm run fixtures:generate
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies API calls to Express on port 3000.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Express port |
| `OCR_PROVIDER` | `openai` | `openai` or deterministic `fake` |
| `OPENAI_API_KEY` | unset | Server-only OpenAI credential |
| `OPENAI_MODEL` | `gpt-5.4-nano` | Configurable image-capable model; the default supports high-volume vision data extraction and structured outputs. |
| `OPENAI_TIMEOUT_MS` | `4200` | Per-label provider deadline |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-process request limit |

The server boots without a key so `/health` and the UI remain available. A real verification request returns a sanitized `503` outcome until `OPENAI_API_KEY` is configured. Never commit `.env`.
The `dev`, `start`, and `start:prod` commands load `.env` with Node's built-in env-file support when the file exists; exported environment variables and Docker `-e` values remain supported.

## Commands

```bash
npm run dev               # Express + Vite development servers
npm test                  # Vitest unit, API, provider, and UI tests
npm run typecheck         # Strict TypeScript checks
npm run build             # Compile Express and build the static client
npm start                 # Run Express from TypeScript
npm run start:prod        # Run the compiled server after npm run build
npm run check             # Typecheck, tests, and production build
```

API documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs), with the OpenAPI 3.1 document at `/openapi.json`.

## API examples

Start with the deterministic provider:

```bash
OCR_PROVIDER=fake npm start
```

Then submit the generated fixture:

```bash
curl -sS -X POST http://localhost:3000/api/v1/verifications \
  -F image=@fixtures/compliant.png \
  -F 'application={"referenceId":"COLA-1001","brandName":"OLD TOM DISTILLERY","classType":"Kentucky Straight Bourbon Whiskey","alcoholContent":"45% Alc./Vol. (90 Proof)","netContents":"750 mL","producerNameAddress":"Old Tom Distillery, Frankfort, Kentucky","countryOfOrigin":"United States"}'
```

For `/api/v1/verifications/batch`, repeat the `images` multipart field one to five times and provide an ordered JSON array in `applications`. A malformed item is isolated as `UNABLE_TO_VERIFY`; structurally invalid batches return a top-level error.

## Batch CSV

Download the template from the browser. Required columns are:

```text
reference_id,image_filename,brand_name,class_type,alcohol_content,net_contents,producer_name_address,country_of_origin
```

`country_of_origin` may be blank. Image filenames must be unique and match selected files exactly. Refreshing or closing the tab discards unfinished work; export completed results before leaving.

## Matching and regulatory scope

- Text comparison is case/punctuation/whitespace normalized, then uses a conservative 0.92 fuzzy threshold.
- ABV and proof are normalized with a 0.05 percentage-point tolerance.
- Supported volume units are normalized to milliliters with a 1 mL tolerance.
- Warning text preserves wording, capitalization, and punctuation while normalizing only layout whitespace.
- The warning heading must be uppercase and bold; the body must not be bold; the statement must be separate and a continuous paragraph.

The prototype covers distilled spirits and application-to-label matching. It does **not** measure type size, make same-field-of-vision determinations, validate every TTB rule, integrate with COLA, or provide a legal approval.

Regulatory reference: [TTB Distilled Spirits Health Warning Statement](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning).

The OpenAI integration follows the official [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) and [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs) guidance.

## Docker

```bash
docker build -t alcohol-label-verification-fed .
docker build --target test -t alcohol-label-verification-fed:test .
docker run --rm -p 3000:3000 \
  -e OCR_PROVIDER=openai \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  alcohol-label-verification-fed
```

The optional `test` target runs the same Vitest suite in a clean Node 24 Linux build stage. The default final image does not contain test files or development dependencies.

For an offline smoke test, use `-e OCR_PROVIDER=fake` and omit the key. Open [http://localhost:3000](http://localhost:3000).

## Privacy and failure behavior

- Images and application values are held in memory only and are not written to disk or a database.
- Logs contain request method, path, status, and duration only.
- The browser sends images only to this same-origin server; the OpenAI key never reaches the browser.
- Provider timeouts and failures never produce a match. They return `UNABLE_TO_VERIFY` with a retryable, sanitized error.
