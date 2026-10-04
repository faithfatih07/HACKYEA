import {
  extractLabel,
  answerUploadedDocument,
  uploadMimeTypes,
} from "./uploads";
import { MAX_UPLOAD_BYTES } from "../src/uploads/schema";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { GeminiProvider } from "./provider";
import { interpretRequest } from "./service";
import { isAllowedOrigin } from "./origin";

// .env is read here only. Neither Vite nor the browser receives its contents.
if (existsSync(".env")) {
  try {
    loadEnvFile(".env");
  } catch {
    console.error("Cannot read server .env file.");
  }
}
const key = process.env.GEMINI_API_KEY;
const provider =
  key && key !== "your_key_here" ? new GeminiProvider(key) : null;
const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };
  // Loopback API; optional phone HTTPS origin is configured explicitly.
  if (!isAllowedOrigin(req.headers.origin, process.env.AGRUNIO_PHONE_ORIGIN)) {
    send(403, { error: "request_rejected" });
    return;
  }
  if (req.method === "GET" && req.url === "/api/status") {
    send(200, { configured: provider !== null });
    return;
  }
  if (
    req.method !== "POST" ||
    !["/api/interpret", "/api/label-extract", "/api/document-answer"].includes(
      req.url ?? "",
    )
  ) {
    send(404, { error: "not_found" });
    return;
  }
  const labelUpload = req.url === "/api/label-extract";
  const mime = req.headers["content-type"]?.split(";")[0] ?? "";
  if (
    labelUpload &&
    !uploadMimeTypes.includes(mime as (typeof uploadMimeTypes)[number])
  ) {
    send(415, { error: "unsupported_file" });
    return;
  }
  if (
    !labelUpload &&
    !req.headers["content-type"]?.startsWith("application/json")
  ) {
    send(415, { error: "json_required" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > (labelUpload ? MAX_UPLOAD_BYTES : 128_000)) {
        send(413, { error: "request_too_large" });
        return;
      }
      chunks.push(chunk);
    }
    if (labelUpload) {
      try {
        send(200, await extractLabel(Buffer.concat(chunks), mime, provider));
      } catch {
        send(400, { error: "invalid_file" });
      }
      return;
    }
    if (req.url === "/api/document-answer") {
      send(
        200,
        await answerUploadedDocument(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
          provider,
        ),
      );
      return;
    }
    send(
      200,
      await interpretRequest(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        provider,
      ),
    );
  } catch {
    send(400, { error: "invalid_request" });
  }
});
server.requestTimeout = 90_000;
const port = Number(process.env.AGRUNIO_API_PORT) || 3001;
server.listen(port, "127.0.0.1", () =>
  console.info(
    `Agrunio API: http://127.0.0.1:${port} (server environment only)`,
  ),
);
