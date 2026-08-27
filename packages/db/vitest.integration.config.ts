import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    environment: "node",
    hookTimeout: 30_000,
    // The integration harness owns one disposable database. Test files migrate and
    // truncate that shared database, so running files concurrently creates schema
    // races and allows one suite to erase another suite's fixtures.
    fileParallelism: false,
  },
})
