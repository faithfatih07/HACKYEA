import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: { proxy: { "/api": "http://127.0.0.1:3001" } },
  server: {
    proxy: { "/api": "http://127.0.0.1:3001" },
    // Keep hot reload reliable in shared or sandboxed working folders.
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ["**/work/**", "**/outputs/**"],
    },
  },
});
