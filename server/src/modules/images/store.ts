import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function imageDirectory(): string {
  const configured = process.env.IMAGE_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "data", "copy-images");
}

function storedImagePath(id: string): string {
  if (!/^[a-z0-9]+$/i.test(id)) {
    throw new Error("Refusing to resolve an image path");
  }
  const directory = imageDirectory();
  const full = path.resolve(directory, id);
  if (full !== path.join(directory, id)) {
    throw new Error("Refusing to resolve an image path");
  }
  return full;
}

export async function writeStoredImage(id: string, bytes: Buffer): Promise<void> {
  const directory = imageDirectory();
  await mkdir(directory, { recursive: true });
  const full = storedImagePath(id);
  const temporary = `${full}.part`;
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, full);
}

export async function readStoredImage(id: string): Promise<Buffer> {
  return readFile(storedImagePath(id));
}

export async function unlinkImages(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        await unlink(storedImagePath(id));
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") console.error(error);
      }
    }),
  );
}
