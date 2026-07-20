import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to node; renderer tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["test/**/*.test.js"],
    watch: false
  }
});
