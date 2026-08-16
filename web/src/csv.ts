import Papa from "papaparse";
import type { ApplicationInput } from "./types.js";

export const CSV_HEADERS = [
  "reference_id",
  "image_filename",
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "producer_name_address",
  "country_of_origin",
] as const;

export interface BatchCsvRow {
  rowNumber: number;
  imageFilename: string;
  application: ApplicationInput;
}

export interface CsvParseResult {
  rows: BatchCsvRow[];
  errors: string[];
}

export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\n` +
  `COLA-1001,compliant.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol. (90 Proof),750 mL,"Old Tom Distillery, Frankfort, Kentucky",United States\n`;

function cell(record: Record<string, string | undefined>, header: string): string {
  return (record[header] ?? "").trim();
}

export function parseBatchCsv(input: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string | undefined>>(input, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLocaleLowerCase("en-US"),
  });
  const errors = parsed.errors.map((error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`);
  const headers = new Set(parsed.meta.fields ?? []);
  for (const header of CSV_HEADERS) {
    if (!headers.has(header)) errors.push(`CSV is missing the “${header}” column.`);
  }
  if (errors.length) return { rows: [], errors };
  if (!parsed.data.length) return { rows: [], errors: ["The CSV does not contain any application rows."] };
  if (parsed.data.length > 300) return { rows: [], errors: ["Use no more than 300 applications in one browser batch."] };

  const seenReferences = new Set<string>();
  const seenImages = new Set<string>();
  const rows: BatchCsvRow[] = [];
  parsed.data.forEach((record, index) => {
    const rowNumber = index + 2;
    const referenceId = cell(record, "reference_id");
    const imageFilename = cell(record, "image_filename");
    const required: Array<[string, string]> = [
      ["reference_id", referenceId],
      ["image_filename", imageFilename],
      ["brand_name", cell(record, "brand_name")],
      ["class_type", cell(record, "class_type")],
      ["alcohol_content", cell(record, "alcohol_content")],
      ["net_contents", cell(record, "net_contents")],
      ["producer_name_address", cell(record, "producer_name_address")],
    ];
    for (const [header, value] of required) {
      if (!value) errors.push(`CSV row ${rowNumber}: “${header}” is required.`);
    }
    if (seenReferences.has(referenceId)) errors.push(`CSV row ${rowNumber}: duplicate reference_id “${referenceId}”.`);
    if (seenImages.has(imageFilename)) errors.push(`CSV row ${rowNumber}: duplicate image_filename “${imageFilename}”.`);
    seenReferences.add(referenceId);
    seenImages.add(imageFilename);
    rows.push({
      rowNumber,
      imageFilename,
      application: {
        referenceId,
        brandName: cell(record, "brand_name"),
        classType: cell(record, "class_type"),
        alcoholContent: cell(record, "alcohol_content"),
        netContents: cell(record, "net_contents"),
        producerNameAddress: cell(record, "producer_name_address"),
        ...(cell(record, "country_of_origin")
          ? { countryOfOrigin: cell(record, "country_of_origin") }
          : {}),
      },
    });
  });
  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function outcomesToCsv(
  outcomes: Array<{
    outcome: string;
    referenceId: string;
    filename: string;
    processingMs: number;
    fields?: Array<{ field: string; status: string; expected: string | null; observed: string | null }>;
    warningChecks?: Array<{ check: string; status: string }>;
    error?: { code: string; message: string };
  }>,
): string {
  const headers = [
    "reference_id",
    "image_filename",
    "outcome",
    "processing_ms",
    "field_results",
    "warning_results",
    "error_code",
    "error_message",
  ];
  const rows = outcomes.map((outcome) => [
    outcome.referenceId,
    outcome.filename,
    outcome.outcome,
    outcome.processingMs,
    outcome.fields?.map((field) => `${field.field}:${field.status}`).join(";") ?? "",
    outcome.warningChecks?.map((check) => `${check.check}:${check.status}`).join(";") ?? "",
    outcome.error?.code ?? "",
    outcome.error?.message ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n") + "\n";
}
