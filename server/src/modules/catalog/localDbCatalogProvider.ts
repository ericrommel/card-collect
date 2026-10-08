import { prisma } from "../../db.js";
import { sampleNoticeForSlug } from "../../catalog/sampleCatalog.js";
import type {
  CatalogCollectible,
  CatalogProvider,
  CatalogSearchHit,
  CatalogSet,
  CatalogUniverse,
} from "./catalogProvider.js";
import { searchCatalogCards } from "./searchCatalog.js";

/**
 * CatalogProvider implementation backed by the local seeded database
 * (Prisma/SQLite). Satisfies the "deterministic local development"
 * requirement without any external network dependency.
 */
export class LocalDbCatalogProvider implements CatalogProvider {
  async listUniverses(): Promise<CatalogUniverse[]> {
    const rows = await prisma.collectibleUniverse.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      notice: sampleNoticeForSlug(row.slug),
    }));
  }

  async listSets(universeId?: string): Promise<CatalogSet[]> {
    const rows = await prisma.set.findMany({
      where: universeId ? { universeId } : undefined,
      orderBy: { releaseDate: "asc" },
    });
    return rows.map(mapSet);
  }

  async getSet(setId: string): Promise<CatalogSet | null> {
    const row = await prisma.set.findUnique({ where: { id: setId } });
    return row ? mapSet(row) : null;
  }

  async listCollectibles(setId: string): Promise<CatalogCollectible[]> {
    const rows = await prisma.collectible.findMany({
      where: { setId },
      orderBy: { number: "asc" },
      include: { variants: true },
    });
    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      setId: row.setId,
      number: row.number,
      name: row.name,
      rarity: row.rarity,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
      variants: row.variants.map((v) => ({ id: v.id, name: v.name, isDefault: v.isDefault })),
    }));
  }

  async searchCollectibles(query: string, limit: number): Promise<{ hits: CatalogSearchHit[]; truncated: boolean }> {
    const rows = await prisma.collectible.findMany({
      select: {
        id: true,
        number: true,
        name: true,
        rarity: true,
        set: { select: { id: true, name: true, code: true, universe: { select: { name: true } } } },
        variants: { where: { isDefault: true }, select: { id: true }, take: 1 },
      },
    });
    const cards: CatalogSearchHit[] = rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      rarity: row.rarity,
      set: { id: row.set.id, name: row.set.name, code: row.set.code },
      universeName: row.set.universe.name,
      defaultVariantId: row.variants[0]?.id ?? null,
    }));
    const found = searchCatalogCards(cards, query, limit);
    return { hits: found.results, truncated: found.truncated };
  }
}

function mapSet(row: {
  id: string;
  providerId: string | null;
  name: string;
  code: string;
  releaseDate: Date | null;
  universeId: string;
}): CatalogSet {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    code: row.code,
    releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
    universeId: row.universeId,
  };
}

export const catalogProvider: CatalogProvider = new LocalDbCatalogProvider();
