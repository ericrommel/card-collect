const API_BASE = "/api";
/** Removed session store. Cleared once so a token saved by an older build cannot sit in the browser. */
const LEGACY_TOKEN_KEY = "cards-collect:token";

export function clearLegacyToken(): void {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

// ---- Types mirroring the API's JSON shapes ----

export interface SelfUser {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Universe {
  id: string;
  name: string;
  slug: string;
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

export type Availability = "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";

export const CONDITION_GRADES = ["Mint", "Near Mint", "Excellent", "Good", "Played", "Poor"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export interface UserCopy {
  id: string;
  availability: Availability;
  condition: string | null;
  reserved: boolean;
  exchange_id: string | null;
  has_front_image: boolean;
  has_back_image: boolean;
  created_at: string;
  updated_at: string;
  variant: {
    id: string;
    name: string;
    collectible: {
      id: string;
      number: string;
      name: string;
      rarity: string | null;
      set_id: string;
    };
  };
}

export interface ChecklistEntry {
  collectible: CatalogCollectible;
  owned_quantity: number;
  duplicate_quantity: number;
  is_owned: boolean;
}

export interface SetProgress {
  set_id: string;
  total_count: number;
  owned_count: number;
  missing_count: number;
  duplicate_count: number;
  completion_percentage: number;
  checklist: ChecklistEntry[];
}

export type MatchType = "MUTUAL_TRADE" | "DONATION";

export interface MatchCollectibleRef {
  id: string;
  number: string;
  name: string;
  rarity: string | null;
}

export interface MatchSideProgress {
  cards_received: number;
  completion_before: number;
  completion_after: number;
  completion_gain: number;
}

export interface CollectorMatch {
  collector: { display_name: string; ref: string };
  type: MatchType;
  score: number;
  current_user: MatchSideProgress;
  /** MUTUAL_TRADE only. */
  other_collector?: MatchSideProgress;
  /** MUTUAL_TRADE only. */
  balance?: { difference: number };
  proposed_exchange: {
    you_receive: MatchCollectibleRef[];
    /** Always [] for DONATION. */
    they_receive: MatchCollectibleRef[];
  };
  /** Set when an open exchange of this type already exists with this collector. */
  open_exchange_id?: string;
}

export type ExchangeStatus = "PROPOSED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "COMPLETED";
export type ExchangeAction = "accept" | "decline" | "cancel" | "confirm";

export interface ExchangeCard {
  number: string;
  name: string;
  rarity: string | null;
  condition: string | null;
}

export interface Exchange {
  id: string;
  type: MatchType;
  status: ExchangeStatus;
  role: "proposer" | "counterparty";
  set: { id: string; name: string; code: string };
  other_collector: { display_name: string; ref: string };
  you_give: ExchangeCard[];
  you_receive: ExchangeCard[];
  you_confirmed: boolean;
  they_confirmed: boolean;
  actions: ExchangeAction[];
  created_at: string;
  updated_at: string;
}

export interface ShareVisibility {
  completion: boolean;
  owned: boolean;
  missing: boolean;
  duplicates: boolean;
  trade: boolean;
  give_away: boolean;
}

export interface ShareSettings {
  enabled: boolean;
  share_id: string;
  expires_at: string | null;
  link_lifetime_days: number;
  view_count: number;
  last_viewed_at: string | null;
  visibility: ShareVisibility;
}

export interface PublicCollectibleRef {
  number: string;
  name: string;
  rarity: string | null;
}

export interface PublicDuplicateRef extends PublicCollectibleRef {
  duplicate_quantity: number;
}

export interface PublicShareView {
  collector: { display_name: string };
  set: { name: string; code: string; total_count: number };
  completion_percentage?: number;
  owned?: PublicCollectibleRef[];
  missing?: PublicCollectibleRef[];
  duplicates?: PublicDuplicateRef[];
  trade_offers?: PublicCollectibleRef[];
  give_away_offers?: PublicCollectibleRef[];
}

// ---- Auth ----

export function register(email: string, password: string, displayName: string) {
  return apiFetch<{ user: SelfUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email: string, password: string) {
  return apiFetch<{ user: SelfUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ user: SelfUser }>("/auth/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function updateDisplayName(displayName: string) {
  return apiFetch<{ user: SelfUser }>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

/** Anonymous callers get `{ user: null }` with status 200, so a page load is not a failed request. */
export function fetchMe() {
  return apiFetch<{ user: SelfUser | null }>("/auth/session");
}

// ---- Catalog ----

export function listUniverses() {
  return apiFetch<{ universes: Universe[] }>("/catalog/universes");
}

export function listSets(universeId?: string) {
  const qs = universeId ? `?universeId=${encodeURIComponent(universeId)}` : "";
  return apiFetch<{ sets: CatalogSet[] }>(`/catalog/sets${qs}`);
}

export function listCollectibles(setId: string) {
  return apiFetch<{ collectibles: CatalogCollectible[] }>(`/catalog/sets/${setId}/collectibles`);
}

// ---- My collection ----

export function myCollection(setId?: string) {
  const qs = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  return apiFetch<{ copies: UserCopy[] }>(`/my/collection${qs}`);
}

export function addCopy(variantId: string, availability: Availability = "KEEP", condition?: ConditionGrade | null) {
  return apiFetch<{ copy: UserCopy }>("/my/collection/copies", {
    method: "POST",
    body: JSON.stringify({ variantId, availability, ...(condition ? { condition } : {}) }),
  });
}

export interface IdentifyCandidate {
  set_code: string;
  number: string;
  name: string;
  confidence: number;
}

export interface IdentifyResponse {
  status: "unavailable" | "candidates";
  candidates: IdentifyCandidate[];
  message: string;
}

async function sendPhoto<T>(path: string, file: File): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
    credentials: "include",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function uploadCopyPhoto(copyId: string, side: "front" | "back", file: File) {
  return sendPhoto<{ image: { side: string; content_type: string } }>(
    `/my/collection/copies/${encodeURIComponent(copyId)}/images/${side}`,
    file,
  );
}

export function deleteCopyPhoto(copyId: string, side: "front" | "back") {
  return apiFetch<void>(`/my/collection/copies/${encodeURIComponent(copyId)}/images/${side}`, { method: "DELETE" });
}

export function identifyPhoto(file: File) {
  return sendPhoto<IdentifyResponse>("/my/collection/identify", file);
}

export function copyImageUrl(copyId: string, side: "front" | "back", version = 0) {
  return `/api/my/collection/copies/${encodeURIComponent(copyId)}/images/${side}?v=${version}`;
}

export function updateCopy(
  copyId: string,
  changes: Partial<{ availability: Availability; condition: ConditionGrade | null }>,
) {
  return apiFetch<{ copy: UserCopy }>(`/my/collection/copies/${copyId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteCopy(copyId: string) {
  return apiFetch<void>(`/my/collection/copies/${copyId}`, { method: "DELETE" });
}

export function setProgress(setId: string) {
  return apiFetch<SetProgress>(`/my/sets/${setId}/progress`);
}

export const BULK_CHUNK = 200;

export function bulkCreateCopies(
  setId: string,
  body: {
    collectible_ids: string[];
    availability?: Availability;
    condition?: ConditionGrade | null;
    mode?: "add" | "ensure_one";
  },
) {
  return apiFetch<{ created_count: number; skipped_count: number }>(`/my/sets/${setId}/copies`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function bulkUpdateCopies(body: {
  copy_ids: string[];
  availability?: Availability;
  condition?: ConditionGrade | null;
}) {
  return apiFetch<{ updated_count: number }>("/my/collection/copies/bulk", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function bulkDeleteCopies(copyIds: string[]) {
  return apiFetch<{ deleted_count: number }>("/my/collection/copies/bulk", {
    method: "DELETE",
    body: JSON.stringify({ copy_ids: copyIds }),
  });
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
  type: MatchType;
  score: number;
  open_exchange_id?: string;
  you_receive_count: number;
  you_give_count: number;
  you_receive_preview: MatchCollectibleRef[];
  you_give_preview: MatchCollectibleRef[];
  your_completion_before: number;
  your_completion_after: number;
  their_completion_before?: number;
  their_completion_after?: number;
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
    recent: Exchange[];
  };
  highlights: {
    trades: DashboardHighlight[];
    donations: DashboardHighlight[];
  };
  recent_copies: {
    id: string;
    collectible_number: string;
    collectible_name: string;
    set_id: string;
    set_code: string;
    availability: Availability;
    condition: string | null;
    created_at: string;
  }[];
}

export function getDashboard() {
  return apiFetch<Dashboard>("/my/dashboard");
}

export function myMatches(setId: string) {
  return apiFetch<{ matches: CollectorMatch[] }>(`/my/matches?setId=${encodeURIComponent(setId)}`);
}

// ---- Exchanges ----

export function listExchanges() {
  return apiFetch<{ exchanges: Exchange[] }>("/my/exchanges");
}

export function proposeExchange(body: { set_id: string; collector_ref: string; type: MatchType }) {
  return apiFetch<{ exchange: Exchange }>("/my/exchanges", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function actOnExchange(exchangeId: string, action: ExchangeAction) {
  return apiFetch<{ exchange: Exchange }>(`/my/exchanges/${encodeURIComponent(exchangeId)}/${action}`, {
    method: "POST",
  });
}

// ---- Sharing ----

export function getShareSettings(setId: string) {
  return apiFetch<{ share: ShareSettings | null }>(`/my/sets/${setId}/share`);
}

export function updateShareSettings(
  setId: string,
  changes: { enabled?: boolean; visibility?: Partial<ShareVisibility> },
) {
  return apiFetch<{ share: ShareSettings }>(`/my/sets/${setId}/share`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

export function regenerateShare(setId: string) {
  return apiFetch<{ share: ShareSettings }>(`/my/sets/${setId}/share/regenerate`, { method: "POST" });
}

export function renewShare(setId: string) {
  return apiFetch<{ share: ShareSettings }>(`/my/sets/${setId}/share/renew`, { method: "POST" });
}

// ---- Public (no auth) ----

export function getPublicCollection(shareId: string) {
  return apiFetch<PublicShareView>(`/public/collections/${encodeURIComponent(shareId)}`);
}
