import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.{ts,tsx,mjs}",
      "lib/**/*.test.ts",
      "app/api/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/route.ts"],
      exclude: ["lib/map.ts", "**/*.test.ts", "tests/**"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 99,
        lines: 99,
        functions: 90,
        branches: 95,
      },
    },
  },
});
