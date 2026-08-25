import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/globalSetup.ts",
    env: {
      // Resolved by Prisma relative to prisma/schema.prisma, i.e. server/prisma/test.db
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
      CORS_ORIGIN: "http://localhost:5173",
    },
    fileParallelism: false,
  },
});
