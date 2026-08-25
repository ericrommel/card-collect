import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const dbFile = path.resolve(serverRoot, "prisma", "test.db");

export default async function globalSetup() {
  for (const suffix of ["", "-journal"]) {
    const file = dbFile + suffix;
    if (existsSync(file)) rmSync(file);
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
