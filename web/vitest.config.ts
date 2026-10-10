import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      // msw intercepts fetch with absolute URLs; relative "/api/..." resolves against this.
      environmentOptions: { jsdom: { url: "http://localhost" } },
      setupFiles: ["./src/test/setup.ts"],
      exclude: ["e2e/**", "node_modules/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["src/features/**"],
        exclude: ["src/features/calculator/api/schema.gen.ts", "**/*.test.*"],
      },
    },
  }),
);
