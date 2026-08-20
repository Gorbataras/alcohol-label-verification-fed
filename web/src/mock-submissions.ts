import type { SubmittedApplication } from "./types.js";

const BASE_APPLICATION = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  producerNameAddress: "Old Tom Distillery, Frankfort, Kentucky",
  countryOfOrigin: "United States",
} as const;

export const MOCK_SUBMISSIONS: readonly SubmittedApplication[] = [
  {
    title: "Clear, compliant label",
    imageFilename: "compliant.png",
    imageUrl: "/compliant.png",
    application: { referenceId: "COLA-DEMO-1001", ...BASE_APPLICATION },
  },
  {
    title: "Submitted brand does not match",
    imageFilename: "brand-mismatch.png",
    imageUrl: "/brand-mismatch.png",
    application: { referenceId: "COLA-DEMO-1002", ...BASE_APPLICATION },
  },
  {
    title: "Warning heading formatting",
    imageFilename: "warning-case.png",
    imageUrl: "/warning-case.png",
    application: { referenceId: "COLA-DEMO-1003", ...BASE_APPLICATION },
  },
  {
    title: "Glare obscures the label",
    imageFilename: "glare.png",
    imageUrl: "/glare.png",
    application: { referenceId: "COLA-DEMO-1004", ...BASE_APPLICATION },
  },
  {
    title: "Rotated label image",
    imageFilename: "rotated.png",
    imageUrl: "/rotated.png",
    application: { referenceId: "COLA-DEMO-1005", ...BASE_APPLICATION },
  },
];
