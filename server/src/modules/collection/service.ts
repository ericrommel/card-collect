import { prisma } from "../../db.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { calculateProgress, type ProgressResult } from "../../domain/progress.js";
import type { CatalogCollectible } from "../catalog/catalogProvider.js";

/** Stored as a plain string (SQLite has no native enum); constrained to
 * KEEP | TRADE | SELL | GIVE_AWAY by the zod schemas at the API boundary. */
export interface CopyWithDetails {
  id: string;
  availability: string;
  condition: string | null;
  createdAt: Date;
  updatedAt: Date;
  variant: {
    id: string;
    name: string;
    collectible: {
      id: string;
      number: string;
      name: string;
      rarity: string | null;
      setId: string;
    };
  };
}

export async function getUserCopies(userId: string, setId?: string): Promise<CopyWithDetails[]> {
  return prisma.userCopy.findMany({
    where: {
      ownerId: userId,
      ...(setId ? { variant: { collectible: { setId } } } : {}),
    },
    include: { variant: { include: { collectible: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export interface SetChecklistEntry {
  collectible: CatalogCollectible;
  ownedQuantity: number;
  duplicateQuantity: number;
  isOwned: boolean;
}

export interface SetProgress {
  setId: string;
  progress: ProgressResult;
  checklist: SetChecklistEntry[];
}

export async function computeSetProgressForUser(userId: string, setId: string): Promise<SetProgress> {
  const collectibles = await catalogProvider.listCollectibles(setId);
  const copies = await getUserCopies(userId, setId);

  const progress = calculateProgress(
    collectibles.map((c) => ({ id: c.id })),
    copies.map((c) => ({ collectibleId: c.variant.collectible.id })),
  );

  const entryByCollectible = new Map(progress.entries.map((e) => [e.collectibleId, e]));
  const checklist: SetChecklistEntry[] = collectibles.map((collectible) => {
    const entry = entryByCollectible.get(collectible.id);
    return {
      collectible,
      ownedQuantity: entry?.ownedQuantity ?? 0,
      duplicateQuantity: entry?.duplicateQuantity ?? 0,
      isOwned: (entry?.ownedQuantity ?? 0) > 0,
    };
  });

  return { setId, progress, checklist };
}

/** Copies eligible to be shown/offered to other collectors. KEEP is never offered. */
export function isOfferable(availability: string): boolean {
  return availability === "TRADE" || availability === "GIVE_AWAY";
}
