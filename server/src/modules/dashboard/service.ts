import { prisma } from "../../db.js";
import { catalogFace } from "../../catalog/faceMetadata.js";
import { sampleNoticeForSlug } from "../../catalog/sampleCatalog.js";
import { calculateProgress, completionPercentageOf } from "../../domain/progress.js";
import { listExchangesForUser, type ExchangeView } from "../exchanges/service.js";
import { computeMatchesForUser, type PublicMatch } from "../matching/service.js";

export interface SetPreviewCard {
  number: string;
  name: string;
  rarity: string | null;
  kind: string | null;
  ink: string | null;
}

export interface DashboardSetSummary {
  id: string;
  code: string;
  name: string;
  release_date: string | null;
  universe_id: string;
  universe_name: string;
  universe_slug: string;
  notice: string | null;
  /** One card from this set. A card you own, or the first card if you own none. */
  preview: SetPreviewCard | null;
  total_count: number;
  owned_count: number;
  missing_count: number;
  duplicate_count: number;
  completion_percentage: number;
  copy_count: number;
  trade_copies: number;
  sell_copies: number;
  donation_copies: number;
  reserved_copies: number;
}

export interface DashboardHighlight {
  set: { id: string; name: string; code: string };
  collector: { display_name: string; ref: string };
  type: PublicMatch["type"];
  score: number;
  open_exchange_id?: string;
  you_receive_count: number;
  you_give_count: number;
  you_receive_preview: PublicMatch["proposed_exchange"]["you_receive"];
  you_give_preview: PublicMatch["proposed_exchange"]["they_receive"];
  your_completion_before: number;
  your_completion_after: number;
  their_completion_before?: number;
  their_completion_after?: number;
}

export interface DashboardRecentCopy {
  id: string;
  collectible_number: string;
  collectible_name: string;
  set_id: string;
  set_code: string;
  rarity: string | null;
  /** Known catalog kind. Null when the catalog does not name one. */
  kind: string | null;
  /** Known catalog ink. Null when the catalog does not name one. */
  ink: string | null;
  availability: string;
  condition: string | null;
  created_at: string;
}

export interface Dashboard {
  totals: {
    set_count: number;
    started_set_count: number;
    total_count: number;
    owned_count: number;
    missing_count: number;
    duplicate_count: number;
    completion_percentage: number;
    copy_count: number;
    trade_copies: number;
    sell_copies: number;
    donation_copies: number;
    reserved_copies: number;
  };
  sets: DashboardSetSummary[];
  exchanges: {
    open_count: number;
    needs_action_count: number;
    recent: ExchangeView[];
  };
  highlights: {
    trades: DashboardHighlight[];
    donations: DashboardHighlight[];
  };
  recent_copies: DashboardRecentCopy[];
}

const PREVIEW_LIMIT = 3;
const HIGHLIGHT_LIMIT = 3;
const RECENT_EXCHANGE_LIMIT = 5;
const RECENT_COPY_LIMIT = 8;

function preview(cards: PublicMatch["proposed_exchange"]["you_receive"]) {
  return cards.slice(0, PREVIEW_LIMIT);
}

export function toHighlight(set: { id: string; name: string; code: string }, match: PublicMatch): DashboardHighlight {
  return {
    set: { id: set.id, name: set.name, code: set.code },
    collector: match.collector,
    type: match.type,
    score: match.score,
    ...(match.open_exchange_id ? { open_exchange_id: match.open_exchange_id } : {}),
    you_receive_count: match.proposed_exchange.you_receive.length,
    you_give_count: match.proposed_exchange.they_receive.length,
    you_receive_preview: preview(match.proposed_exchange.you_receive),
    you_give_preview: preview(match.proposed_exchange.they_receive),
    your_completion_before: match.current_user.completion_before,
    your_completion_after: match.current_user.completion_after,
    ...(match.other_collector
      ? {
          their_completion_before: match.other_collector.completion_before,
          their_completion_after: match.other_collector.completion_after,
        }
      : {}),
  };
}

function byUsefulness(a: DashboardHighlight, b: DashboardHighlight): number {
  return (
    b.score - a.score ||
    a.set.code.localeCompare(b.set.code) ||
    a.collector.display_name.localeCompare(b.collector.display_name)
  );
}

/** Top trade and donation matches. Callers decide which sets are in scope. */
export function pickHighlights(
  groups: { set: { id: string; name: string; code: string }; matches: PublicMatch[] }[],
): Dashboard["highlights"] {
  const rows = groups.flatMap((group) => group.matches.map((match) => toHighlight(group.set, match)));
  return {
    trades: rows
      .filter((row) => row.type === "MUTUAL_TRADE")
      .sort(byUsefulness)
      .slice(0, HIGHLIGHT_LIMIT),
    donations: rows
      .filter((row) => row.type === "DONATION")
      .sort(byUsefulness)
      .slice(0, HIGHLIGHT_LIMIT),
  };
}

/**
 * The card shown on a set cover. Prefer one you own. Among those, the
 * lowest number wins, so the cover does not jump around. An untouched
 * set uses the first card in the catalog.
 */
export function previewCollectible<T extends { id: string; number: string }>(
  cards: readonly T[],
  ownedIds: ReadonlySet<string>,
): T | null {
  if (cards.length === 0) return null;
  const owned = cards.filter((card) => ownedIds.has(card.id));
  const pool = owned.length > 0 ? owned : cards;
  let best = pool[0];
  for (const card of pool) {
    if (card.number < best.number) best = card;
  }
  return best;
}

function needsAction(exchange: ExchangeView): boolean {
  if (exchange.status === "PROPOSED" && exchange.role === "counterparty") return true;
  if (exchange.status === "ACCEPTED" && !exchange.you_confirmed) return true;
  return false;
}

/**
 * Home-screen summary from real rows only.
 *
 * Match highlights are limited to sets the collector has already started.
 * An untouched set can still have donations, but those stay on that set's
 * Matches page so an empty catalog does not crowd out a collection in progress.
 */
export async function buildDashboard(userId: string): Promise<Dashboard> {
  const [setRows, copyRows, exchanges] = await Promise.all([
    prisma.set.findMany({
      include: {
        universe: true,
        collectibles: { select: { id: true, number: true, name: true, rarity: true, metadata: true } },
      },
      orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
    }),
    prisma.userCopy.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        availability: true,
        condition: true,
        reservedByExchangeId: true,
        createdAt: true,
        variant: {
          select: {
            collectible: {
              select: {
                id: true,
                number: true,
                name: true,
                rarity: true,
                metadata: true,
                setId: true,
                set: { select: { code: true } },
              },
            },
          },
        },
      },
    }),
    listExchangesForUser(userId),
  ]);

  const copiesBySet = new Map<string, typeof copyRows>();
  for (const copy of copyRows) {
    const setId = copy.variant.collectible.setId;
    const list = copiesBySet.get(setId);
    if (list) list.push(copy);
    else copiesBySet.set(setId, [copy]);
  }

  const sets: DashboardSetSummary[] = setRows.map((set) => {
    const copies = copiesBySet.get(set.id) ?? [];
    const progress = calculateProgress(
      set.collectibles,
      copies.map((copy) => ({ collectibleId: copy.variant.collectible.id })),
    );
    const ownedIds = new Set(copies.map((copy) => copy.variant.collectible.id));
    const card = previewCollectible(set.collectibles, ownedIds);
    const preview = card
      ? { number: card.number, name: card.name, rarity: card.rarity, ...catalogFace(card.metadata) }
      : null;
    return {
      id: set.id,
      code: set.code,
      name: set.name,
      release_date: set.releaseDate ? set.releaseDate.toISOString() : null,
      universe_id: set.universeId,
      universe_name: set.universe.name,
      universe_slug: set.universe.slug,
      notice: sampleNoticeForSlug(set.universe.slug),
      preview,
      total_count: progress.totalCount,
      owned_count: progress.ownedCount,
      missing_count: progress.missingCount,
      duplicate_count: progress.duplicateCount,
      completion_percentage: progress.completionPercentage,
      copy_count: copies.length,
      trade_copies: copies.filter((copy) => copy.availability === "TRADE").length,
      sell_copies: copies.filter((copy) => copy.availability === "SELL").length,
      donation_copies: copies.filter((copy) => copy.availability === "GIVE_AWAY").length,
      reserved_copies: copies.filter((copy) => copy.reservedByExchangeId != null).length,
    };
  });

  const totals = sets.reduce(
    (sum, set) => {
      sum.set_count += 1;
      if (set.owned_count > 0) sum.started_set_count += 1;
      sum.total_count += set.total_count;
      sum.owned_count += set.owned_count;
      sum.missing_count += set.missing_count;
      sum.duplicate_count += set.duplicate_count;
      sum.copy_count += set.copy_count;
      sum.trade_copies += set.trade_copies;
      sum.sell_copies += set.sell_copies;
      sum.donation_copies += set.donation_copies;
      sum.reserved_copies += set.reserved_copies;
      return sum;
    },
    {
      set_count: 0,
      started_set_count: 0,
      total_count: 0,
      owned_count: 0,
      missing_count: 0,
      duplicate_count: 0,
      completion_percentage: 0,
      copy_count: 0,
      trade_copies: 0,
      sell_copies: 0,
      donation_copies: 0,
      reserved_copies: 0,
    },
  );
  totals.completion_percentage = completionPercentageOf(totals.owned_count, totals.total_count);

  const started = sets.filter((set) => set.owned_count > 0);
  const groups = await Promise.all(
    started.map(async (set) => ({
      set: { id: set.id, name: set.name, code: set.code },
      matches: await computeMatchesForUser(userId, set.id),
    })),
  );

  const recentCopies = [...copyRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RECENT_COPY_LIMIT)
    .map((copy) => {
      const face = catalogFace(copy.variant.collectible.metadata);
      return {
        id: copy.id,
        collectible_number: copy.variant.collectible.number,
        collectible_name: copy.variant.collectible.name,
        set_id: copy.variant.collectible.setId,
        set_code: copy.variant.collectible.set.code,
        rarity: copy.variant.collectible.rarity,
        kind: face.kind,
        ink: face.ink,
        availability: copy.availability,
        condition: copy.condition,
        created_at: copy.createdAt.toISOString(),
      };
    });

  return {
    totals,
    sets,
    exchanges: {
      open_count: exchanges.filter((exchange) => exchange.status === "PROPOSED" || exchange.status === "ACCEPTED")
        .length,
      needs_action_count: exchanges.filter(needsAction).length,
      recent: exchanges.slice(0, RECENT_EXCHANGE_LIMIT),
    },
    highlights: pickHighlights(groups),
    recent_copies: recentCopies,
  };
}
