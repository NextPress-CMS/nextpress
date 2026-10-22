import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@nextpress/core": resolve(__dirname, "../../packages/core/src"),
      "@nextpress/blocks": resolve(__dirname, "../../packages/blocks/src"),
    },
  },
});
