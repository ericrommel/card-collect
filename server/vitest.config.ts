import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/globalSetup.ts",
    env: {
      // Resolved by Prisma relative to prisma/schema.prisma, i.e. server/prisma/test.db
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
      CORS_ORIGIN: "http://localhost:5173",
      IMAGE_DIR: path.join(serverRoot, "test-images"),
    },
    fileParallelism: false,
  },
});
