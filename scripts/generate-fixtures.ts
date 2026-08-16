import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CANONICAL_GOVERNMENT_WARNING } from "../src/domain/warning.js";

const outputDirectory = path.resolve(process.cwd(), "fixtures");

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrapSvgText(value: string, maximumCharacters = 78): string[] {
  return value.split(/\s+/).reduce<string[]>((lines, word) => {
    const lastLine = lines.at(-1);
    if (!lastLine || lastLine.length + word.length + 1 > maximumCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${lastLine} ${word}`;
    }
    return lines;
  }, []);
}

function labelSvg(options: {
  brand?: string;
  warningHeading?: string;
  foreground?: string;
  background?: string;
} = {}): Buffer {
  const brand = options.brand ?? "OLD TOM DISTILLERY";
  const heading = options.warningHeading ?? "GOVERNMENT WARNING:";
  const warningBody = CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING: ", "");
  const warningLines = wrapSvgText(warningBody)
    .map((line, index) => `<tspan x="150" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
    .join("");
  const foreground = options.foreground ?? "#181511";
  const background = options.background ?? "#f5ead0";
  return Buffer.from(`
    <svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="1600" fill="${background}"/>
      <rect x="60" y="60" width="1080" height="1480" rx="28" fill="none" stroke="#6d3d1e" stroke-width="12"/>
      <text x="600" y="225" text-anchor="middle" font-family="Georgia, serif" font-size="74" font-weight="bold" fill="${foreground}">${escapeXml(brand)}</text>
      <text x="600" y="315" text-anchor="middle" font-family="Arial, sans-serif" font-size="43" fill="${foreground}">Kentucky Straight Bourbon Whiskey</text>
      <text x="600" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="39" fill="${foreground}">45% Alc./Vol. (90 Proof)</text>
      <text x="600" y="490" text-anchor="middle" font-family="Arial, sans-serif" font-size="39" fill="${foreground}">750 mL</text>
      <text x="600" y="590" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="${foreground}">Distilled by Old Tom Distillery</text>
      <text x="600" y="640" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="${foreground}">Frankfort, Kentucky · Product of United States</text>
      <rect x="115" y="860" width="970" height="500" fill="#fffdfa" stroke="${foreground}" stroke-width="4"/>
      <text x="150" y="930" font-family="Arial, sans-serif" font-size="29" font-weight="bold" fill="${foreground}">${escapeXml(heading)}</text>
      <text x="150" y="985" font-family="Arial, sans-serif" font-size="23" font-weight="normal" fill="${foreground}">${warningLines}</text>
    </svg>
  `);
}

async function writeFixtures(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const compliant = await sharp(labelSvg()).png().toBuffer();
  await sharp(compliant).toFile(path.join(outputDirectory, "compliant.png"));
  await sharp(labelSvg({ brand: "SOME OTHER DISTILLERY" })).png().toFile(path.join(outputDirectory, "brand-mismatch.png"));
  await sharp(labelSvg({ warningHeading: "Government Warning:" })).png().toFile(path.join(outputDirectory, "warning-case.png"));
  await sharp(compliant).blur(1.8).toFile(path.join(outputDirectory, "blur.png"));
  await sharp(compliant).rotate(7, { background: "#d7d7d7" }).toFile(path.join(outputDirectory, "rotated.png"));
  await sharp(compliant)
    .composite([{ input: Buffer.from('<svg width="1200" height="1600"><defs><linearGradient id="g"><stop stop-color="white" stop-opacity="0"/><stop offset=".5" stop-color="white" stop-opacity=".8"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><path d="M250 0 L720 0 L1050 1600 L580 1600 Z" fill="url(#g)"/></svg>') }])
    .toFile(path.join(outputDirectory, "glare.png"));
  await sharp(labelSvg({ foreground: "#817c72", background: "#aaa69d" })).png().toFile(path.join(outputDirectory, "low-contrast.png"));
}

await writeFixtures();
console.log(`Generated label fixtures in ${outputDirectory}`);
