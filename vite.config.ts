import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Explicit opt-in for phone testing on the local network. Never read Gemini
// credentials here; TLS files stay on the development computer.
const phoneHttps = process.env.AGRUNIO_LOCAL_HTTPS === "1";

export default defineConfig({
  plugins: [react()],
  preview: { proxy: { "/api": "http://127.0.0.1:3001" } },
  server: {
    ...(phoneHttps
      ? {
          host: "0.0.0.0",
          port: 5173,
          strictPort: true,
          https: {
            cert: readFileSync(".certs/agrunio-cert.pem"),
            key: readFileSync(".certs/agrunio-key.pem"),
          },
        }
      : {}),
    proxy: { "/api": "http://127.0.0.1:3001" },
    // Keep hot reload reliable in shared or sandboxed working folders.
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ["**/work/**", "**/outputs/**"],
    },
  },
});
