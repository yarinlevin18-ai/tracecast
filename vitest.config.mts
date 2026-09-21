import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "components/**/*.test.tsx"],
    environment: "node",
    globals: true,
  },
  resolve: { alias: { "@": import.meta.dirname } },
});
