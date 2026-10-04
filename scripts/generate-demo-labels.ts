import { mkdir, writeFile } from "node:fs/promises";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { demoProductCodes } from "../src/scanning/catalog";

function svg(width: number, height: number, rectangles: string[]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 4}" height="${height * 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${rectangles.join("")}</g></svg>\n`;
}

await mkdir("public/demo", { recursive: true });
for (const codes of demoProductCodes) {
  const { modules } = QRCode.create(codes.qr, { errorCorrectionLevel: "M" });
  const squares: string[] = [];
  // Four-module quiet zone on every side; black on pure white for scanning.
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x))
        squares.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
  await writeFile(
    `public${codes.qrImage}`,
    svg(modules.size + 8, modules.size + 8, squares),
  );

  // Documented JsBarcode object renderer: no DOM/canvas/native dependencies.
  const data: { encodings?: { data: string }[] } = {};
  JsBarcode(data, codes.ean13, { format: "EAN13", displayValue: false });
  const bars = data.encodings!.map((encoding) => encoding.data).join("");
  const rectangles = [...bars].flatMap((bit, x) =>
    bit === "1" ? [`<rect x="${x + 12}" y="10" width="1" height="60"/>`] : [],
  );
  await writeFile(
    `public${codes.barcodeImage}`,
    svg(bars.length + 24, 80, rectangles),
  );
}
console.info("Generated two synthetic QR and EAN-13 demo labels.");
