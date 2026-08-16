export const CANONICAL_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export function normalizeWarningLayout(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u00a0\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
