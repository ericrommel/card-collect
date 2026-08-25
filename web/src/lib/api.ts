const API_BASE = "/api";
const TOKEN_KEY = "cards-collect:token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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

export interface UserCopy {
  id: string;
  availability: Availability;
  condition: string | null;
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

export interface MatchOffer {
  collectible: { id: string; number: string; name: string; rarity: string | null };
  availability: "TRADE" | "GIVE_AWAY";
}

export interface CollectorMatch {
  collector: { display_name: string };
  is_mutual_match: boolean;
  you_can_receive: MatchOffer[];
  you_can_offer: MatchOffer[];
  donation_opportunities: MatchOffer[];
  set_completion_before: number;
  set_completion_after_estimate: number;
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
  return apiFetch<{ token: string; user: SelfUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email: string, password: string) {
  return apiFetch<{ token: string; user: SelfUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe() {
  return apiFetch<{ user: SelfUser }>("/auth/me");
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

export function addCopy(variantId: string, availability: Availability = "KEEP") {
  return apiFetch<{ copy: UserCopy }>("/my/collection/copies", {
    method: "POST",
    body: JSON.stringify({ variantId, availability }),
  });
}

export function updateCopy(copyId: string, changes: Partial<{ availability: Availability; condition: string | null }>) {
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

export function myMatches(setId: string) {
  return apiFetch<{ matches: CollectorMatch[] }>(`/my/matches?setId=${encodeURIComponent(setId)}`);
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

// ---- Public (no auth) ----

export function getPublicCollection(shareId: string) {
  return apiFetch<PublicShareView>(`/public/collections/${encodeURIComponent(shareId)}`);
}
