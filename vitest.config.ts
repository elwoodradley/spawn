import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // Tests that touch the DOM opt in with `// @vitest-environment jsdom`.
    coverage: { reporter: ["text", "lcov"], include: ["src/**/*.{ts,tsx}"] },
  },
  resolve: { conditions: ["development", "browser"] },
});
