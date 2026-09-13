import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const SYNTHETIC_SAAS_PDF_LINES = [
  "SYNTHETIC TEST CONTRACT - NOT A REAL AGREEMENT",
  "Vendor: NoticeControl E2E Vendor",
  "Service: Synthetic Collaboration Software",
  "Contract start date: January 1, 2027",
  "Renewal date: December 31, 2027",
  "Automatic renewal: Yes, annual renewal",
  "Cancellation notice: 30 days before renewal",
  "Annual contract value: EUR 12,000",
  "This fixture contains no customer or production data."
];

export async function createSyntheticSaasPdfFixture(outputPath) {
  const document = await PDFDocument.create();
  document.setTitle("NoticeControl synthetic SaaS renewal fixture");
  document.setAuthor("NoticeControl automated tests");
  document.setSubject("Synthetic staging acceptance fixture");
  document.setCreationDate(new Date("2026-01-01T00:00:00.000Z"));
  document.setModificationDate(new Date("2026-01-01T00:00:00.000Z"));
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  SYNTHETIC_SAAS_PDF_LINES.forEach((line, index) => {
    page.drawText(line, { x: 54, y: 720 - index * 30, size: 12, font });
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await document.save());
  return outputPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("An output path is required for the synthetic SaaS PDF fixture.");
    process.exit(1);
  }
  await createSyntheticSaasPdfFixture(outputPath);
  console.log(`Synthetic SaaS PDF fixture created at ${outputPath}.`);
}
