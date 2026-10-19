import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "monitor/**/*.test.ts"],
    environment: "node",
  },
});
