import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/apiError.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { getUserCopies, isOfferable } from "../collection/service.js";
import { calculateProgress } from "../../domain/progress.js";
import {
  buildPublicShareView,
  type PublicShareView,
  type ShareCollectibleRef,
  type ShareVisibility,
} from "../../domain/sharingView.js";
import { generateShareId } from "./shareId.js";

export interface OwnShareSettings {
  shareId: string;
  enabled: boolean;
  visibility: ShareVisibility;
}

function toOwnSettings(row: {
  shareId: string;
  enabled: boolean;
  showCompletion: boolean;
  showOwned: boolean;
  showMissing: boolean;
  showDuplicates: boolean;
  showTrade: boolean;
  showGiveAway: boolean;
}): OwnShareSettings {
  return {
    shareId: row.shareId,
    enabled: row.enabled,
    visibility: {
      showCompletion: row.showCompletion,
      showOwned: row.showOwned,
      showMissing: row.showMissing,
      showDuplicates: row.showDuplicates,
      showTrade: row.showTrade,
      showGiveAway: row.showGiveAway,
    },
  };
}

export async function getOwnShareSettings(ownerId: string, setId: string): Promise<OwnShareSettings | null> {
  const row = await prisma.collectionShare.findUnique({ where: { ownerId_setId: { ownerId, setId } } });
  return row ? toOwnSettings(row) : null;
}

export interface ShareSettingsChanges {
  enabled?: boolean;
  visibility?: Partial<ShareVisibility>;
}

/** Creates the share row (with a fresh shareId) on first use; otherwise updates it in place. */
export async function updateShareSettings(
  ownerId: string,
  setId: string,
  changes: ShareSettingsChanges,
): Promise<OwnShareSettings> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const row = await prisma.collectionShare.upsert({
    where: { ownerId_setId: { ownerId, setId } },
    update: {
      ...(changes.enabled !== undefined ? { enabled: changes.enabled } : {}),
      ...(changes.visibility ?? {}),
    },
    create: {
      ownerId,
      setId,
      shareId: generateShareId(),
      enabled: changes.enabled ?? false,
      showCompletion: changes.visibility?.showCompletion ?? true,
      showOwned: changes.visibility?.showOwned ?? true,
      showMissing: changes.visibility?.showMissing ?? true,
      showDuplicates: changes.visibility?.showDuplicates ?? true,
      showTrade: changes.visibility?.showTrade ?? true,
      showGiveAway: changes.visibility?.showGiveAway ?? true,
    },
  });

  return toOwnSettings(row);
}

/**
 * Rotates the public shareId, invalidating the previous link immediately.
 * Preserves `enabled` and visibility preferences (creates a disabled row
 * with default visibility if sharing was never configured for this set).
 */
export async function regenerateShareId(ownerId: string, setId: string): Promise<OwnShareSettings> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const newShareId = generateShareId();
  const row = await prisma.collectionShare.upsert({
    where: { ownerId_setId: { ownerId, setId } },
    update: { shareId: newShareId },
    create: { ownerId, setId, shareId: newShareId, enabled: false },
  });

  return toOwnSettings(row);
}

function toRefs(
  collectibleIds: string[],
  byId: Map<string, { number: string; name: string; rarity: string | null }>,
): ShareCollectibleRef[] {
  return collectibleIds.map((id) => {
    const c = byId.get(id);
    return { number: c?.number ?? "", name: c?.name ?? "Unknown", rarity: c?.rarity ?? null };
  });
}

/**
 * Public, unauthenticated lookup. Returns null for a shareId that never
 * existed AND for one that is disabled/revoked — callers must map both
 * to 404, never distinguishing the two (see docs/architecture.md).
 */
export async function getPublicShareView(shareId: string): Promise<PublicShareView | null> {
  const share = await prisma.collectionShare.findUnique({
    where: { shareId },
    include: { owner: true, set: true },
  });
  if (!share || !share.enabled) return null;

  const collectibles = await catalogProvider.listCollectibles(share.setId);
  const collectiblesById = new Map(
    collectibles.map((c) => [c.id, { number: c.number, name: c.name, rarity: c.rarity }]),
  );

  const copies = await getUserCopies(share.ownerId, share.setId);
  const progress = calculateProgress(
    collectibles.map((c) => ({ id: c.id })),
    copies.map((c) => ({ collectibleId: c.variant.collectible.id })),
  );

  const duplicateCollectibles = progress.entries
    .filter((e) => e.duplicateQuantity > 0)
    .map((e) => {
      const c = collectiblesById.get(e.collectibleId);
      return {
        number: c?.number ?? "",
        name: c?.name ?? "Unknown",
        rarity: c?.rarity ?? null,
        duplicate_quantity: e.duplicateQuantity,
      };
    });

  const offerableCollectibleIds = (availability: "TRADE" | "GIVE_AWAY") => {
    const ids = new Set<string>();
    for (const copy of copies) {
      if (copy.availability === availability && isOfferable(copy.availability)) {
        ids.add(copy.variant.collectible.id);
      }
    }
    return [...ids];
  };

  return buildPublicShareView({
    collectorDisplayName: share.owner.displayName,
    setName: share.set.name,
    setCode: share.set.code,
    totalCount: progress.totalCount,
    completionPercentage: progress.completionPercentage,
    ownedCollectibles: toRefs(progress.ownedCollectibleIds, collectiblesById),
    missingCollectibles: toRefs(progress.missingCollectibleIds, collectiblesById),
    duplicateCollectibles,
    tradeOffers: toRefs(offerableCollectibleIds("TRADE"), collectiblesById),
    giveAwayOffers: toRefs(offerableCollectibleIds("GIVE_AWAY"), collectiblesById),
    visibility: {
      showCompletion: share.showCompletion,
      showOwned: share.showOwned,
      showMissing: share.showMissing,
      showDuplicates: share.showDuplicates,
      showTrade: share.showTrade,
      showGiveAway: share.showGiveAway,
    },
  });
}
