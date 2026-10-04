import {
  ChecksumException,
  DecodeHintType,
  EAN13Reader,
  FormatException,
  NotFoundException,
  QRCodeReader,
} from "@zxing/library";
import type { Reader } from "@zxing/library";

// Only the two supported formats. Expected QR misses fall through to EAN-13;
// unlike MultiFormatReader 0.23 this does not log a stack trace for every miss.
export function productCodeReader(): Reader {
  const qr = new QRCodeReader(),
    ean = new EAN13Reader();
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  return {
    decode(image) {
      try {
        return qr.decode(image, hints);
      } catch (error) {
        if (!(
          error instanceof NotFoundException ||
          error instanceof ChecksumException ||
          error instanceof FormatException
        ))
          throw error;
      }
      return ean.decode(image, hints);
    },
    reset() {
      qr.reset();
      ean.reset();
    },
  };
}
