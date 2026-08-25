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

## Not implemented in V0

Payments, shipping, checkout, public marketplace transactions, unrestricted
chat, precise location, and reputation endpoints are intentionally absent —
see the [product scope](README.md#mvp-scope) and [risks.md](risks.md).
