import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../web");
const webPublic = path.join(webRoot, "public");

describe("installable website", () => {
  it("does not cache API responses", () => {
    const worker = readFileSync(path.join(webPublic, "sw.js"), "utf8");
    expect(worker).toContain('pathname.startsWith("/api/")');
    expect(worker).toContain('cache: "no-store"');
    expect(worker).not.toContain("caches.open");
    expect(worker).not.toContain("cache.put");
    expect(worker).not.toContain("caches.match");
  });

  it("describes a website, with icons, and not a native app", () => {
    const manifest = JSON.parse(readFileSync(path.join(webPublic, "manifest.webmanifest"), "utf8"));
    expect(manifest.name).toBe("Cards Collect");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    const html = readFileSync(path.join(webRoot, "index.html"), "utf8");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    const viteConfig = readFileSync(path.join(webRoot, "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('"X-Robots-Tag": "noindex, nofollow"');
    const webPackage = readFileSync(path.join(webRoot, "package.json"), "utf8");
    expect(webPackage).toContain("--config vite.config.ts");
    for (const icon of manifest.icons) {
      const relative = String(icon.src).replace(/^\/+/, "");
      expect(readFileSync(path.join(webPublic, relative)).subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
  });
});
