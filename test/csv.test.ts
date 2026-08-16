import { describe, expect, it } from "vitest";
import { CSV_HEADERS, outcomesToCsv, parseBatchCsv } from "../web/src/csv.js";

function row(index: number): string {
  return `REF-${index},label-${index}.png,Old Tom Distillery,Kentucky Straight Bourbon Whiskey,45%,750 mL,"Old Tom Distillery, Frankfort, Kentucky",United States`;
}

describe("batch CSV", () => {
  it("parses quoted fields and an optional country", () => {
    const parsed = parseBatchCsv(`${CSV_HEADERS.join(",")}\n${row(1)}\nREF-2,label-2.png,Brand,Vodka,40%,1 L,"Producer, Austin TX",\n`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.application.producerNameAddress).toBe("Old Tom Distillery, Frankfort, Kentucky");
    expect(parsed.rows[1]?.application.countryOfOrigin).toBeUndefined();
  });

  it("accepts 300 rows and rejects 301", () => {
    const threeHundred = `${CSV_HEADERS.join(",")}\n${Array.from({ length: 300 }, (_, index) => row(index)).join("\n")}`;
    expect(parseBatchCsv(threeHundred).rows).toHaveLength(300);
    expect(parseBatchCsv(`${threeHundred}\n${row(300)}`).errors[0]).toContain("300");
  });

  it("reports missing columns, blank cells, and duplicates", () => {
    expect(parseBatchCsv("reference_id,image_filename\nA,a.png").errors).toContain("CSV is missing the “brand_name” column.");
    const duplicate = parseBatchCsv(`${CSV_HEADERS.join(",")}\n${row(1)}\n${row(1)}`);
    expect(duplicate.errors.some((error) => error.includes("duplicate reference_id"))).toBe(true);
    expect(duplicate.errors.some((error) => error.includes("duplicate image_filename"))).toBe(true);
  });

  it("exports compact result details with safe CSV quoting", () => {
    const csv = outcomesToCsv([
      {
        outcome: "UNABLE_TO_VERIFY",
        referenceId: "REF,1",
        filename: "label.png",
        processingMs: 10,
        error: { code: "FAILED", message: "Try again, later" },
      },
    ]);
    expect(csv).toContain('"REF,1"');
    expect(csv).toContain('"Try again, later"');
  });
});
