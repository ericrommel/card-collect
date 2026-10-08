import type { CatalogCollectible, CatalogVariant, ConditionGrade, UserCopy } from "./api";

export type OwnershipFilter = "all" | "owned" | "missing" | "duplicates";
export type AvailabilityFilter = "any" | "keep" | "trade" | "sell" | "donation";
export type ConditionFilter = "any" | "unset" | ConditionGrade;
export type ExplorerSort = "number" | "name" | "rarity" | "owned" | "missing" | "duplicates";
export type ExplorerView = "grid" | "list";

export interface ExplorerEntry {
  collectible: CatalogCollectible;
  ownedQuantity: number;
  duplicateQuantity: number;
  isOwned: boolean;
  copies: UserCopy[];
}

export interface ExplorerFilters {
  search: string;
  ownership: OwnershipFilter;
  rarities: string[];
  availability: AvailabilityFilter;
  condition: ConditionFilter;
  metadata: Record<string, string[]>;
  sort: ExplorerSort;
}

export const EMPTY_FILTERS: ExplorerFilters = {
  search: "",
  ownership: "all",
  rarities: [],
  availability: "any",
  condition: "any",
  metadata: {},
  sort: "number",
};

const RARITY_RANK: Record<string, number> = {
  legendary: 6,
  secret: 6,
  sec: 6,
  l: 5,
  sr: 5,
  rare: 4,
  r: 4,
  uncommon: 3,
  uc: 3,
  common: 2,
  c: 2,
};

export function rarityRank(rarity: string | null): number {
  if (!rarity) return 0;
  return RARITY_RANK[rarity.trim().toLowerCase()] ?? 1;
}

export function defaultVariant(collectible: CatalogCollectible): CatalogVariant | undefined {
  return collectible.variants.find((variant) => variant.isDefault) ?? collectible.variants[0];
}

export function metadataFacets(entries: ExplorerEntry[]): { key: string; values: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const entry of entries) {
    const metadata = entry.collectible.metadata;
    if (!metadata) continue;
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value !== "string" || value.length === 0 || value.length > 40) continue;
      const values = map.get(key) ?? new Set<string>();
      values.add(value);
      map.set(key, values);
    }
  }
  return [...map.entries()]
    .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }))
    .filter((facet) => facet.values.length > 1 && facet.values.length <= 12)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function metadataText(collectible: CatalogCollectible): string {
  if (!collectible.metadata) return "";
  return Object.values(collectible.metadata)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function matchesSearch(entry: ExplorerEntry, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const collectible = entry.collectible;
  const haystack = [collectible.name, collectible.number, collectible.rarity ?? "", metadataText(collectible)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesAvailability(entry: ExplorerEntry, filter: AvailabilityFilter): boolean {
  if (filter === "any") return true;
  const wanted = filter === "keep" ? "KEEP" : filter === "trade" ? "TRADE" : filter === "sell" ? "SELL" : "GIVE_AWAY";
  return entry.copies.some((copy) => copy.availability === wanted);
}

function matchesCondition(entry: ExplorerEntry, filter: ConditionFilter): boolean {
  if (filter === "any") return true;
  if (filter === "unset") return entry.copies.some((copy) => copy.condition == null);
  return entry.copies.some((copy) => copy.condition === filter);
}

function matchesMetadata(entry: ExplorerEntry, selected: Record<string, string[]>): boolean {
  for (const [key, values] of Object.entries(selected)) {
    if (values.length === 0) continue;
    const raw = entry.collectible.metadata?.[key];
    if (typeof raw !== "string" || !values.includes(raw)) return false;
  }
  return true;
}

export function filterEntries(entries: ExplorerEntry[], filters: ExplorerFilters): ExplorerEntry[] {
  return entries.filter((entry) => {
    if (filters.ownership === "owned" && !entry.isOwned) return false;
    if (filters.ownership === "missing" && entry.isOwned) return false;
    if (filters.ownership === "duplicates" && entry.duplicateQuantity <= 0) return false;
    if (filters.rarities.length > 0 && !filters.rarities.includes(entry.collectible.rarity ?? "")) return false;
    if (!matchesAvailability(entry, filters.availability)) return false;
    if (!matchesCondition(entry, filters.condition)) return false;
    if (!matchesMetadata(entry, filters.metadata)) return false;
    return matchesSearch(entry, filters.search);
  });
}

export function sortEntries(entries: ExplorerEntry[], sort: ExplorerSort): ExplorerEntry[] {
  const copy = [...entries];
  const byNumber = (a: ExplorerEntry, b: ExplorerEntry) => a.collectible.number.localeCompare(b.collectible.number);
  copy.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.collectible.name.localeCompare(b.collectible.name) || byNumber(a, b);
      case "rarity":
        return rarityRank(b.collectible.rarity) - rarityRank(a.collectible.rarity) || byNumber(a, b);
      case "owned":
        return b.ownedQuantity - a.ownedQuantity || byNumber(a, b);
      case "missing":
        return Number(a.isOwned) - Number(b.isOwned) || byNumber(a, b);
      case "duplicates":
        return b.duplicateQuantity - a.duplicateQuantity || byNumber(a, b);
      default:
        return byNumber(a, b);
    }
  });
  return copy;
}

export function applyExplorerQuery(entries: ExplorerEntry[], filters: ExplorerFilters): ExplorerEntry[] {
  return sortEntries(filterEntries(entries, filters), filters.sort);
}

const OWNERSHIP_PARAMS: OwnershipFilter[] = ["all", "owned", "missing", "duplicates"];
const AVAILABILITY_PARAMS: AvailabilityFilter[] = ["any", "keep", "trade", "sell", "donation"];

export function filtersFromSearchParams(params: URLSearchParams): ExplorerFilters {
  const ownership = params.get("ownership");
  const availability = params.get("availability");
  return {
    ...EMPTY_FILTERS,
    search: params.get("q") ?? "",
    ownership: OWNERSHIP_PARAMS.includes(ownership as OwnershipFilter) ? (ownership as OwnershipFilter) : "all",
    availability: AVAILABILITY_PARAMS.includes(availability as AvailabilityFilter)
      ? (availability as AvailabilityFilter)
      : "any",
  };
}

/** Only the fields a link needs. Sort and the other filters stay on the page. */
export function searchParamsFromFilters(filters: ExplorerFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search);
  if (filters.ownership !== "all") params.set("ownership", filters.ownership);
  if (filters.availability !== "any") params.set("availability", filters.availability);
  return params;
}

export function explorerLead(filters: ExplorerFilters): string | null {
  const parts: string[] = [];
  if (filters.ownership === "missing") parts.push("cards you don't have");
  if (filters.ownership === "owned") parts.push("cards you have");
  if (filters.ownership === "duplicates") parts.push("cards you have more than one of");
  if (filters.availability === "keep") parts.push("copies you are keeping");
  if (filters.availability === "trade") parts.push("copies for trade");
  if (filters.availability === "sell") parts.push("copies for sale");
  if (filters.availability === "donation") parts.push("copies you would give away");
  return parts.length === 0 ? null : `Showing ${parts.join(" and ")}.`;
}

export function activeFilterCount(filters: ExplorerFilters): number {
  let count = 0;
  if (filters.ownership !== "all") count += 1;
  if (filters.rarities.length > 0) count += 1;
  if (filters.availability !== "any") count += 1;
  if (filters.condition !== "any") count += 1;
  if (Object.values(filters.metadata).some((values) => values.length > 0)) count += 1;
  return count;
}

const VIEW_KEY = "cards-collect:explorer-view";

export function readExplorerView(): ExplorerView {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function writeExplorerView(view: ExplorerView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Preference only. The in-memory view still works if storage is blocked.
  }
}
