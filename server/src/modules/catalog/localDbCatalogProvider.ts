import { prisma } from "../../db.js";
import type {
  CatalogCollectible,
  CatalogProvider,
  CatalogSet,
  CatalogUniverse,
} from "./catalogProvider.js";

/**
 * CatalogProvider implementation backed by the local seeded database
 * (Prisma/SQLite). Satisfies the "deterministic local development"
 * requirement without any external network dependency.
 */
export class LocalDbCatalogProvider implements CatalogProvider {
  async listUniverses(): Promise<CatalogUniverse[]> {
    const rows = await prisma.collectibleUniverse.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
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
