/**
 * Abstraction over "where card/set catalog data comes from". V0 ships a
 * single implementation backed by the seeded local database, but the
 * domain/API layer never talks to Prisma directly for catalog reads —
 * only through this interface. This is what lets a future adapter
 * (e.g. a licensed external API with caching/normalization) replace the
 * data source without touching business logic. See docs/risks.md
 * "Catalog Data Licensing" and "External Provider Availability".
 */

export interface CatalogUniverse {
  id: string;
  name: string;
  slug: string;
  /** Present for sample catalogs that must not be mistaken for an official set. */
  notice: string | null;
}

export interface CatalogSet {
  id: string;
  providerId: string | null;
  name: string;
  code: string;
  releaseDate: string | null;
  universeId: string;
}

export interface CatalogVariant {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface CatalogCollectible {
  id: string;
  providerId: string | null;
  setId: string;
  number: string;
  name: string;
  rarity: string | null;
  metadata: Record<string, unknown> | null;
  variants: CatalogVariant[];
}

export interface CatalogSearchHit {
  id: string;
  number: string;
  name: string;
  rarity: string | null;
  set: { id: string; name: string; code: string };
  universeName: string;
}

export interface CatalogProvider {
  listUniverses(): Promise<CatalogUniverse[]>;
  listSets(universeId?: string): Promise<CatalogSet[]>;
  getSet(setId: string): Promise<CatalogSet | null>;
  listCollectibles(setId: string): Promise<CatalogCollectible[]>;
  /** Name, number, and set text. Not ownership, price, or artwork. */
  searchCollectibles(query: string, limit: number): Promise<{ hits: CatalogSearchHit[]; truncated: boolean }>;
}
