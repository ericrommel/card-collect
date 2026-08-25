/**
 * Pure collection-progress calculations. No I/O, no framework types, so
 * these are trivial to unit test and safe to reuse for any collectible
 * universe (not just One Piece).
 */

export interface ProgressCollectible {
  id: string;
}

export interface ProgressUserCopy {
  /** The Collectible this physical copy belongs to (via its Variant). */
  collectibleId: string;
}

export interface CollectibleOwnership {
  collectibleId: string;
  ownedQuantity: number;
  duplicateQuantity: number;
}

export interface ProgressResult {
  totalCount: number;
  ownedCount: number;
  missingCount: number;
  /** Sum of (ownedQuantity - 1) across owned collectibles. */
  duplicateCount: number;
  /** 0-100, rounded to 1 decimal place. */
  completionPercentage: number;
  ownedCollectibleIds: string[];
  missingCollectibleIds: string[];
  entries: CollectibleOwnership[];
}

/**
 * Multiple physical copies of the same collectible must count once
 * toward completion — completion is measured over distinct collectibles
 * owned, never over raw copy count.
 */
export function calculateProgress(
  setCollectibles: ProgressCollectible[],
  userCopies: ProgressUserCopy[],
): ProgressResult {
  const quantityByCollectible = new Map<string, number>();
  for (const copy of userCopies) {
    quantityByCollectible.set(copy.collectibleId, (quantityByCollectible.get(copy.collectibleId) ?? 0) + 1);
  }

  const ownedCollectibleIds: string[] = [];
  const missingCollectibleIds: string[] = [];
  const entries: CollectibleOwnership[] = [];
  let duplicateCount = 0;

  for (const collectible of setCollectibles) {
    const ownedQuantity = quantityByCollectible.get(collectible.id) ?? 0;
    if (ownedQuantity > 0) {
      ownedCollectibleIds.push(collectible.id);
      duplicateCount += ownedQuantity - 1;
    } else {
      missingCollectibleIds.push(collectible.id);
    }
    entries.push({
      collectibleId: collectible.id,
      ownedQuantity,
      duplicateQuantity: Math.max(0, ownedQuantity - 1),
    });
  }

  const totalCount = setCollectibles.length;
  const ownedCount = ownedCollectibleIds.length;
  const missingCount = missingCollectibleIds.length;
  const completionPercentage = totalCount === 0 ? 0 : Math.round((ownedCount / totalCount) * 1000) / 10;

  return {
    totalCount,
    ownedCount,
    missingCount,
    duplicateCount,
    completionPercentage,
    ownedCollectibleIds,
    missingCollectibleIds,
    entries,
  };
}
