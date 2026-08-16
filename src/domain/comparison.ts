import type {
  ApplicationInput,
  ExtractedLabel,
  FieldCheck,
  FieldName,
  VerificationSuccess,
  WarningCheck,
} from "../dtos/VerificationDto.js";
import { CANONICAL_GOVERNMENT_WARNING, normalizeWarningLayout } from "./warning.js";

const MATCH_THRESHOLD = 0.92;
const UNCERTAIN_THRESHOLD = 0.8;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’‘`]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function textSimilarity(expected: string, observed: string): number {
  const left = normalizeText(expected);
  const right = normalizeText(observed);
  if (left === right) return 1;
  const score = (a: string, b: string) => {
    const length = Math.max(a.length, b.length);
    return length === 0 ? 1 : 1 - levenshteinDistance(a, b) / length;
  };
  const raw = score(left, right);
  const tokenSorted = score(
    left.split(" ").sort().join(" "),
    right.split(" ").sort().join(" "),
  );
  return Math.round(Math.max(raw, tokenSorted) * 1_000) / 1_000;
}

function textCheck(
  field: FieldName,
  expected: string,
  observed: string | null,
): FieldCheck {
  if (observed === null || !observed.trim()) {
    return {
      field,
      status: "NOT_FOUND",
      expected,
      observed: null,
      score: null,
      detail: "The value could not be read from the label.",
    };
  }
  const score = textSimilarity(expected, observed);
  if (score >= MATCH_THRESHOLD) {
    return {
      field,
      status: "MATCH",
      expected,
      observed,
      score,
      detail: score === 1 ? "Values match after normalization." : "Values are a high-confidence fuzzy match.",
    };
  }
  if (score >= UNCERTAIN_THRESHOLD) {
    return {
      field,
      status: "UNCERTAIN",
      expected,
      observed,
      score,
      detail: "Values are similar but require an agent's review.",
    };
  }
  return {
    field,
    status: "MISMATCH",
    expected,
    observed,
    score,
    detail: "Values do not match.",
  };
}

export function parseAbv(value: string): number | null {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  const percent = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return Number(percent[1]);
  const proof = normalized.match(/(\d+(?:\.\d+)?)\s*(?:°\s*)?proof/);
  if (proof) return Number(proof[1]) / 2;
  if (/^\s*\d+(?:\.\d+)?\s*$/.test(normalized)) return Number(normalized.trim());
  return null;
}

function abvCheck(expected: string, observed: string | null): FieldCheck {
  if (!observed) {
    return { field: "alcoholContent", status: "NOT_FOUND", expected, observed: null, score: null, detail: "Alcohol content could not be read." };
  }
  const expectedAbv = parseAbv(expected);
  const observedAbv = parseAbv(observed);
  if (expectedAbv === null || observedAbv === null) {
    return { field: "alcoholContent", status: "UNCERTAIN", expected, observed, score: null, detail: "Alcohol content could not be normalized." };
  }
  const difference = Math.abs(expectedAbv - observedAbv);
  return {
    field: "alcoholContent",
    status: difference <= 0.05 ? "MATCH" : "MISMATCH",
    expected,
    observed,
    score: Math.max(0, Math.round((1 - difference / Math.max(expectedAbv, 1)) * 1_000) / 1_000),
    detail: difference <= 0.05 ? "Alcohol content matches after ABV/proof normalization." : "Alcohol content differs from the application.",
  };
}

const VOLUME_FACTORS: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  centilitre: 10,
  centilitres: 10,
  l: 1_000,
  liter: 1_000,
  liters: 1_000,
  litre: 1_000,
  litres: 1_000,
  "fl oz": 29.5735295625,
  "fluid ounce": 29.5735295625,
  "fluid ounces": 29.5735295625,
};

export function parseVolumeMl(value: string): number | null {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/fl\.\s*oz\.?/g, "fl oz")
    .replace(/\b(ml|cl|l)\./g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(millilit(?:er|re)s?|ml|centilit(?:er|re)s?|cl|lit(?:er|re)s?|l|fluid ounces?|fl oz)\b/,
  );
  if (!match) return null;
  const factor = VOLUME_FACTORS[match[2]!];
  return factor ? Number(match[1]) * factor : null;
}

function volumeCheck(expected: string, observed: string | null): FieldCheck {
  if (!observed) {
    return { field: "netContents", status: "NOT_FOUND", expected, observed: null, score: null, detail: "Net contents could not be read." };
  }
  const expectedMl = parseVolumeMl(expected);
  const observedMl = parseVolumeMl(observed);
  if (expectedMl === null || observedMl === null) {
    return { field: "netContents", status: "UNCERTAIN", expected, observed, score: null, detail: "Net contents could not be normalized." };
  }
  const difference = Math.abs(expectedMl - observedMl);
  return {
    field: "netContents",
    status: difference <= 1 ? "MATCH" : "MISMATCH",
    expected,
    observed,
    score: Math.max(0, Math.round((1 - difference / Math.max(expectedMl, 1)) * 1_000) / 1_000),
    detail: difference <= 1 ? "Net contents match after unit normalization." : "Net contents differ from the application.",
  };
}

const COUNTRY_CODES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  "u s": "US",
  "u s a": "US",
  "united kingdom": "GB",
  uk: "GB",
  gb: "GB",
  "great britain": "GB",
  france: "FR",
  italy: "IT",
  spain: "ES",
  germany: "DE",
  mexico: "MX",
  canada: "CA",
  chile: "CL",
  argentina: "AR",
  australia: "AU",
  portugal: "PT",
  ireland: "IE",
  japan: "JP",
};

export function canonicalizeCountry(value: string): string {
  const normalized = normalizeText(value);
  return COUNTRY_CODES[normalized] ?? normalized.toLocaleUpperCase("en-US");
}

function countryCheck(expected: string | undefined, observed: string | null): FieldCheck {
  if (!expected?.trim()) {
    return { field: "countryOfOrigin", status: "NOT_APPLICABLE", expected: null, observed, score: null, detail: "Country of origin was not supplied for this application." };
  }
  if (!observed) {
    return { field: "countryOfOrigin", status: "NOT_FOUND", expected, observed: null, score: null, detail: "Country of origin could not be read." };
  }
  const matches = canonicalizeCountry(expected) === canonicalizeCountry(observed);
  return { field: "countryOfOrigin", status: matches ? "MATCH" : "MISMATCH", expected, observed, score: matches ? 1 : 0, detail: matches ? "Countries match after canonicalization." : "Country of origin differs from the application." };
}

function booleanWarningCheck(
  check: WarningCheck["check"],
  observed: boolean | null,
  detail: string,
): WarningCheck {
  return {
    check,
    status: observed === null ? "UNCERTAIN" : observed ? "MATCH" : "MISMATCH",
    expected: true,
    observed,
    detail: observed === null ? "The formatting could not be determined from the image." : detail,
  };
}

export function compareWarning(extracted: ExtractedLabel): WarningCheck[] {
  const observedText = extracted.governmentWarningText;
  const textStatus = observedText === null
    ? "NOT_FOUND"
    : normalizeWarningLayout(observedText) === normalizeWarningLayout(CANONICAL_GOVERNMENT_WARNING)
      ? "MATCH"
      : "MISMATCH";
  const text: WarningCheck = {
    check: "text",
    status: textStatus,
    expected: CANONICAL_GOVERNMENT_WARNING,
    observed: observedText,
    detail: textStatus === "MATCH" ? "Warning wording, capitalization, and punctuation match." : textStatus === "NOT_FOUND" ? "The government warning could not be read." : "Warning wording, capitalization, or punctuation differs from the required text.",
  };
  return [
    text,
    booleanWarningCheck("headingUppercase", extracted.warningFormat.headingIsUppercase, "The warning heading is uppercase."),
    booleanWarningCheck("headingBold", extracted.warningFormat.headingIsBold, "The warning heading is bold."),
    booleanWarningCheck("bodyNotBold", extracted.warningFormat.bodyIsNotBold, "The warning body is not bold."),
    booleanWarningCheck("separateFromOtherText", extracted.warningFormat.separateFromOtherText, "The warning is separate from surrounding text."),
    booleanWarningCheck("continuousParagraph", extracted.warningFormat.continuousParagraph, "The warning appears as a continuous paragraph."),
  ];
}

export function compareLabel(
  application: ApplicationInput,
  extracted: ExtractedLabel,
  filename: string,
  processingMs: number,
): VerificationSuccess {
  const fields: FieldCheck[] = [
    textCheck("brandName", application.brandName, extracted.brandName),
    textCheck("classType", application.classType, extracted.classType),
    abvCheck(application.alcoholContent, extracted.alcoholContent),
    volumeCheck(application.netContents, extracted.netContents),
    textCheck("producerNameAddress", application.producerNameAddress, extracted.producerNameAddress),
    countryCheck(application.countryOfOrigin, extracted.countryOfOrigin),
  ];
  const warningChecks = compareWarning(extracted);
  const allFieldsMatch = fields.every((field) => field.status === "MATCH" || field.status === "NOT_APPLICABLE");
  const warningMatches = warningChecks.every((check) => check.status === "MATCH");
  return {
    outcome: allFieldsMatch && warningMatches ? "MATCH" : "NEEDS_REVIEW",
    referenceId: application.referenceId,
    filename,
    fields,
    warningChecks,
    processingMs,
  };
}
