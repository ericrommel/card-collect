# API Reference — V0

Base URL (local dev): `http://localhost:4000/api`

All request/response bodies are JSON. All `my/*` routes require:

```text
Authorization: Bearer <token>
```

obtained from `/auth/register` or `/auth/login`. Tokens expire after 7 days.

Error responses have the shape `{ "error": "message" }` (400/401/403/404/409)
or `{ "error": "Invalid request", "details": {...} }` for validation errors.

## Auth

### `POST /auth/register`

```json
{ "email": "alice@example.com", "password": "password123", "displayName": "Alice" }
```

→ `201 { "token": "...", "user": { "id", "email", "display_name", "created_at" } }`

`password` must be 8-200 characters. Returns `409` if the email is already
registered.

### `POST /auth/login`

```json
{ "email": "alice@example.com", "password": "password123" }
```

→ `200 { "token": "...", "user": {...} }`, or `401` on bad credentials.

### `GET /auth/me` (auth required)

→ `200 { "user": {...} }` — the caller's own profile only.

## Catalog (read-only, no auth required)

### `GET /catalog/universes`

→ `200 { "universes": [{ "id", "name", "slug" }] }`

### `GET /catalog/sets?universeId=<id>`

`universeId` optional. → `200 { "sets": [{ "id", "providerId", "name", "code", "releaseDate", "universeId" }] }`

### `GET /catalog/sets/:id`

→ `200 { "set": {...} }` or `404`.

### `GET /catalog/sets/:id/collectibles`

→ `200 { "collectibles": [{ "id", "providerId", "setId", "number", "name", "rarity", "metadata", "variants": [{ "id", "name", "isDefault" }] }] }`

## My collection (auth required, always scoped to the caller)

### `GET /my/collection?setId=<id>`

`setId` optional — omit to list every copy the caller owns across all sets.

→ `200 { "copies": [PublicCopy] }` where `PublicCopy` is:

```json
{
  "id": "...",
  "availability": "KEEP | TRADE | SELL | GIVE_AWAY",
  "condition": "string | null",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "variant": {
    "id": "...", "name": "Base",
    "collectible": { "id", "number", "name", "rarity", "set_id" }
  }
}
```

### `POST /my/collection/copies`

```json
{ "variantId": "...", "availability": "KEEP", "condition": "NM" }
```

`variantId` required; `availability` defaults to `KEEP`; `condition` optional
free text (≤60 chars). → `201 { "copy": PublicCopy }`, or `400` for an
unknown `variantId`.

### `PATCH /my/collection/copies/:id`

```json
{ "availability": "TRADE", "condition": null }
```

Both fields optional. → `200 { "copy": PublicCopy }`. Returns **404** (not 403) if the copy doesn't exist _or_ belongs to another user — a caller
cannot distinguish the two, which is deliberate (see
[architecture.md](architecture.md#authentication--authorization)).

### `DELETE /my/collection/copies/:id`

→ `204` on success, `404` under the same rule as `PATCH`.

## My progress

### `GET /my/sets/:id/progress` (auth required)

→ `200`:

```json
{
  "set_id": "...",
  "total_count": 24,
  "owned_count": 16,
  "missing_count": 8,
  "duplicate_count": 3,
  "completion_percentage": 66.7,
  "checklist": [
    {
      "collectible": { "id", "number", "name", "rarity", "variants": [...] },
      "owned_quantity": 2,
      "duplicate_quantity": 1,
      "is_owned": true
    }
  ]
}
```

`checklist` covers every Collectible in the set, owned or not, so a client
can render the full set list from one call.

## My matches

### `GET /my/matches?setId=<id>` (auth required)

`setId` is required — matching is always scoped to one Set. → `200`:

```json
{
  "matches": [
    {
      "collector": { "display_name": "Bob (Zoro Fan)" },
      "is_mutual_match": true,
      "you_can_receive": [
        { "collectible": { "id", "number", "name", "rarity" }, "availability": "TRADE" }
      ],
      "you_can_offer": [
        { "collectible": {...}, "availability": "GIVE_AWAY" }
      ],
      "donation_opportunities": [
        { "collectible": {...}, "availability": "GIVE_AWAY" }
      ],
      "set_completion_before": 0.708,
      "set_completion_after_estimate": 0.833
    }
  ]
}
```

- Only collectors with at least one signal (something you can receive or
  offer) are included — no zero-signal noise.
- `donation_opportunities` is a subset of `you_can_receive`, surfaced
  separately; it is non-empty even when `you_can_offer` is empty (a pure
  one-way donation).
- No email, user id, or other account metadata is ever included — only
  `display_name` and card/availability data.

## My sharing (auth required, always scoped to the caller)

Lets a user publish a limited, read-only, revocable view of their progress
for one Set. See [architecture.md](architecture.md#collection-sharing-v01)
for the design rationale.

### `GET /my/sets/:id/share` (auth required)

→ `200 { "share": null }` if sharing was never configured for this set, else:

```json
{
  "share": {
    "enabled": true,
    "share_id": "H1aiHFVjz0XYZ0zVZw95xZG0",
    "visibility": {
      "completion": true,
      "owned": true,
      "missing": true,
      "duplicates": true,
      "trade": true,
      "give_away": true
    }
  }
}
```

`share_id` is always returned once a row exists, even while `enabled` is
`false` — this is the owner's own view of their settings, not the public
endpoint, so there's nothing to hide from them here.

### `PUT /my/sets/:id/share`

```json
{ "enabled": true, "visibility": { "owned": false, "missing": false } }
```

Both fields optional; `visibility` only needs the keys you're changing.
First call for a given set creates the row (with a fresh `share_id` and all
visibility flags defaulting to `true`); later calls update it in place —
toggling `enabled` off and back on **keeps the same `share_id`** (a
"disable" is a pause, not a reset). → `200 { "share": {...} }` (same shape
as `GET`), or `404` if the set doesn't exist.

### `POST /my/sets/:id/share/regenerate`

No body. Rotates `share_id` to a new random token, invalidating the
previous public link immediately. Preserves `enabled` and all visibility
flags. → `200 { "share": {...} }`.

## Public collections (no auth)

### `GET /public/collections/:shareId`

Read-only, unauthenticated. → `200` with only the fields the owner's
visibility settings permit:

```json
{
  "collector": { "display_name": "Alice (Luffy Fan)" },
  "set": { "name": "Starter Voyage", "code": "SV-01", "total_count": 24 },
  "completion_percentage": 66.7,
  "owned": [{ "number": "SV01-001", "name": "Straw Hat Captain", "rarity": "L" }],
  "missing": [{ "number": "SV01-020", "name": "Voyage's End Treasure", "rarity": "SEC" }],
  "duplicates": [{ "number": "SV01-003", "name": "Sniper's Steady Aim", "rarity": "C", "duplicate_quantity": 1 }],
  "trade_offers": [{ "number": "SV01-003", "name": "Sniper's Steady Aim", "rarity": "C" }],
  "give_away_offers": [{ "number": "SV01-012", "name": "Grand Line Current", "rarity": "C" }]
}
```

Every field except `collector` and `set` is **omitted entirely** (not
`null`) when the owner has that visibility flag off — a client should
treat an absent key as "the owner chose not to show this," not as an
empty list.

→ `404` if `shareId` was never issued, belongs to a disabled/revoked share,
or doesn't exist — these three cases are indistinguishable by design (see
architecture.md). No email, internal user id, location, or any field
outside the shape above is ever present.

Only `GET` is defined on this path; `PUT`/`POST`/`DELETE` all 404.

## Not implemented in V0

Payments, shipping, checkout, public marketplace transactions, unrestricted
chat, precise location, and reputation endpoints are intentionally absent —
see the [product scope](README.md#mvp-scope) and [risks.md](risks.md).
