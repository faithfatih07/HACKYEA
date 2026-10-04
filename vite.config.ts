import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Keep hot reload reliable in shared or sandboxed working folders.
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ["**/work/**", "**/outputs/**"],
    },
  },
});
