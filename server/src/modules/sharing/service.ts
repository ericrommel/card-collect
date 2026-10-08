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

/** How long a public link works after it is turned on, renewed, or regenerated. */
export const SHARE_LINK_LIFETIME_DAYS = 30;
const SHARE_LINK_LIFETIME_MS = SHARE_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export function nextShareExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SHARE_LINK_LIFETIME_MS);
}

/** Public only while sharing is on and the end time is still in the future. */
export function isShareLinkOpen(row: { enabled: boolean; expiresAt: Date | null }, now = new Date()): boolean {
  return row.enabled && row.expiresAt != null && row.expiresAt.getTime() > now.getTime();
}

export interface OwnShareSettings {
  shareId: string;
  enabled: boolean;
  expiresAt: Date | null;
  visibility: ShareVisibility;
}

function toOwnSettings(row: {
  shareId: string;
  enabled: boolean;
  expiresAt: Date | null;
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
    expiresAt: row.expiresAt,
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

  const now = new Date();
  const existing = await prisma.collectionShare.findUnique({ where: { ownerId_setId: { ownerId, setId } } });
  // Turning sharing on starts a window only when the link is not already
  // open. A visibility edit, or saving "on" again, leaves the end time alone.
  // Turning it off clears the end time. The public id stays the same.
  let expiresAt: Date | null | undefined;
  if (changes.enabled === false) expiresAt = null;
  else if (changes.enabled === true && !isShareLinkOpen(existing ?? { enabled: false, expiresAt: null }, now)) {
    expiresAt = nextShareExpiry(now);
  }

  const row = await prisma.collectionShare.upsert({
    where: { ownerId_setId: { ownerId, setId } },
    update: {
      ...(changes.enabled !== undefined ? { enabled: changes.enabled } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(changes.visibility ?? {}),
    },
    create: {
      ownerId,
      setId,
      shareId: generateShareId(),
      enabled: changes.enabled ?? false,
      expiresAt: changes.enabled ? nextShareExpiry(now) : null,
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
 * An enabled link also gets a new lifetime. A disabled link does not.
 */
export async function regenerateShareId(ownerId: string, setId: string): Promise<OwnShareSettings> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const existing = await prisma.collectionShare.findUnique({ where: { ownerId_setId: { ownerId, setId } } });
  const newShareId = generateShareId();
  const row = await prisma.collectionShare.upsert({
    where: { ownerId_setId: { ownerId, setId } },
    update: {
      shareId: newShareId,
      ...(existing?.enabled ? { expiresAt: nextShareExpiry() } : {}),
    },
    create: { ownerId, setId, shareId: newShareId, enabled: false, expiresAt: null },
  });

  return toOwnSettings(row);
}

/**
 * Keeps the same public id and starts a new lifetime from now.
 * Sharing must already be on. An expired link can be renewed.
 */
export async function renewShareLink(ownerId: string, setId: string): Promise<OwnShareSettings> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const existing = await prisma.collectionShare.findUnique({ where: { ownerId_setId: { ownerId, setId } } });
  if (!existing || !existing.enabled) {
    throw ApiError.conflict("Turn sharing on before renewing the link.");
  }

  const row = await prisma.collectionShare.update({
    where: { id: existing.id },
    data: { expiresAt: nextShareExpiry() },
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
 * existed, one that is disabled, and one whose time has passed. Callers
 * must map all of those to the same 404 (see docs/architecture.md).
 */
export async function getPublicShareView(shareId: string): Promise<PublicShareView | null> {
  const share = await prisma.collectionShare.findUnique({
    where: { shareId },
    include: { owner: true, set: true },
  });
  if (!share || !isShareLinkOpen(share)) return null;

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
