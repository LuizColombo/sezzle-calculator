import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Go API runs on :8080; proxy its routes so the browser
// sees one origin, exactly as it does behind nginx in Docker.
const api = "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": api,
      "/healthz": api,
      "/docs": api,
      "/openapi.yaml": api,
    },
  },
});
