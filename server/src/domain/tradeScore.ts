/**
 * Turns a candidate exchange (domain/matching.ts) plus each side's
 * current progress (domain/progress.ts) into a 0-100 usefulness score
 * and a structured breakdown a client can render an explanation from.
 * Pure and framework-free: no Express, no Prisma, no randomness, no
 * database ids anywhere in the inputs or outputs.
 *
 * This is a "collection usefulness" score, not a measure of objective
 * market/financial trade fairness — it only ever looks at how much
 * closer each side gets to completing the set. See
 * docs/architecture.md#trade-score-formula for the full write-up of the
 * formula below.
 */
import { completionPercentageOf, ownedCountAfterTransfer } from "./progress.js";

export type MatchType = "MUTUAL_TRADE" | "DONATION";

export interface CollectibleRef {
  id: string;
  number: string;
  name: string;
  rarity: string | null;
}

export interface SetProgressSnapshot {
  totalCount: number;
  ownedCount: number;
  /**
   * Physical copies of each collectible this person has now.
   * A card they would give away must be listed. An unlisted card that
   * leaves is treated as their only copy.
   */
  quantityByCollectible: ReadonlyMap<string, number>;
}

export interface SideProgress {
  cardsReceived: number;
  completionBefore: number;
  completionAfter: number;
  completionGain: number;
}

export interface TradeScoreBreakdown {
  score: number;
  type: MatchType;
  currentUser: SideProgress;
  /** MUTUAL_TRADE only. */
  otherCollector?: SideProgress;
  /** MUTUAL_TRADE only. */
  balance?: { difference: number };
  proposedExchange: {
    currentUserReceives: CollectibleRef[];
    /** Always [] for DONATION — never a fabricated reciprocal side. */
    otherCollectorReceives: CollectibleRef[];
  };
}

function computeSideProgress(snapshot: SetProgressSnapshot, receivedIds: string[], givenIds: string[]): SideProgress {
  const completionBefore = completionPercentageOf(snapshot.ownedCount, snapshot.totalCount);
  const ownedAfter = ownedCountAfterTransfer(
    snapshot.totalCount,
    snapshot.ownedCount,
    snapshot.quantityByCollectible,
    receivedIds,
    givenIds,
  );
  const completionAfter = completionPercentageOf(ownedAfter, snapshot.totalCount);
  return {
    cardsReceived: receivedIds.length,
    completionBefore,
    completionAfter,
    completionGain: Math.round((completionAfter - completionBefore) * 10) / 10,
  };
}

function refFor(id: string, byId: Map<string, CollectibleRef>): CollectibleRef {
  return byId.get(id) ?? { id, number: "", name: "Unknown", rarity: null };
}

// ---- Scoring formula constants (see docs/architecture.md#trade-score-formula) ----

/** Flat multiplier rewarding true reciprocity — applied to MUTUAL_TRADE only. */
const RECIPROCITY_BONUS = 1.15;
/** Minimum fraction of the balance multiplier retained even at maximum imbalance. */
const BALANCE_FLOOR = 0.4;
const BALANCE_RANGE = 1 - BALANCE_FLOOR;

/**
 * sqrt-scales a raw completion-gain percentage (0-100) so a modest,
 * meaningful gain registers clearly on the 0-100 score instead of a
 * formula dominated by literally summing card counts against a large
 * set. Monotonic, so every "more gain -> higher score" property below
 * still holds exactly.
 */
function scaleGain(gainPercentagePoints: number): number {
  return 100 * Math.sqrt(Math.max(0, gainPercentagePoints) / 100);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreMutualTrade(
  currentUserSnapshot: SetProgressSnapshot,
  otherCollectorSnapshot: SetProgressSnapshot,
  candidate: { currentUserReceives: string[]; otherCollectorReceives: string[] },
  collectiblesById: Map<string, CollectibleRef>,
): TradeScoreBreakdown {
  const currentUser = computeSideProgress(
    currentUserSnapshot,
    candidate.currentUserReceives,
    candidate.otherCollectorReceives,
  );
  const otherCollector = computeSideProgress(
    otherCollectorSnapshot,
    candidate.otherCollectorReceives,
    candidate.currentUserReceives,
  );

  const scaledCurrent = scaleGain(currentUser.completionGain);
  const scaledOther = scaleGain(otherCollector.completionGain);
  const base = (scaledCurrent + scaledOther) / 2;
  const larger = Math.max(scaledCurrent, scaledOther);
  const smaller = Math.min(scaledCurrent, scaledOther);
  const balanceRatio = larger > 0 ? smaller / larger : 1;
  const balanceMultiplier = BALANCE_FLOOR + BALANCE_RANGE * balanceRatio;

  return {
    score: clampScore(base * balanceMultiplier * RECIPROCITY_BONUS),
    type: "MUTUAL_TRADE",
    currentUser,
    otherCollector,
    balance: { difference: Math.abs(currentUser.cardsReceived - otherCollector.cardsReceived) },
    proposedExchange: {
      currentUserReceives: candidate.currentUserReceives.map((id) => refFor(id, collectiblesById)),
      otherCollectorReceives: candidate.otherCollectorReceives.map((id) => refFor(id, collectiblesById)),
    },
  };
}

export function scoreDonation(
  currentUserSnapshot: SetProgressSnapshot,
  donatedCollectibleIds: string[],
  collectiblesById: Map<string, CollectibleRef>,
): TradeScoreBreakdown {
  const currentUser = computeSideProgress(currentUserSnapshot, donatedCollectibleIds, []);

  return {
    // No balance factor (one-sided by construction) and no reciprocity
    // bonus (there is no reciprocity) — the recipient's scaled gain
    // stands alone.
    score: clampScore(scaleGain(currentUser.completionGain)),
    type: "DONATION",
    currentUser,
    proposedExchange: {
      currentUserReceives: donatedCollectibleIds.map((id) => refFor(id, collectiblesById)),
      otherCollectorReceives: [],
    },
  };
}

export interface ScoredMatch extends TradeScoreBreakdown {
  collectorDisplayName: string;
  /**
   * Opaque collector ref. Used only as the final tie-break when two
   * collectors share a display name. Never a database id.
   */
  collectorRef?: string;
}

/**
 * Deterministic ranking, in order:
 *  1. highest score;
 *  2. largest current-user completion gain;
 *  3. largest "mutual" completion gain — the other collector's gain for
 *     a MUTUAL_TRADE, or 0 for a DONATION (which has no other side);
 *  4. the other collector's display name, ascending — a stable,
 *     business-level field, never a raw database id or query/insertion
 *     order.
 *  5. the opaque collector ref, ascending, so two people who picked the
 *     same display name still get a stable order.
 * No step here is random or depends on how the database happened to
 * return rows.
 */
export function compareMatches(a: ScoredMatch, b: ScoredMatch): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.currentUser.completionGain !== a.currentUser.completionGain) {
    return b.currentUser.completionGain - a.currentUser.completionGain;
  }
  const aOtherGain = a.otherCollector?.completionGain ?? 0;
  const bOtherGain = b.otherCollector?.completionGain ?? 0;
  if (bOtherGain !== aOtherGain) return bOtherGain - aOtherGain;
  const byName = a.collectorDisplayName.localeCompare(b.collectorDisplayName);
  if (byName !== 0) return byName;
  return (a.collectorRef ?? "").localeCompare(b.collectorRef ?? "");
}
