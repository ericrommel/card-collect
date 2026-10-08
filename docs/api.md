# API Reference — V0

Base URL (local dev): `http://localhost:4000/api`

All request/response bodies are JSON. All `my/*` routes require the
httpOnly session cookie set by `/auth/register` or `/auth/login`, or
`Authorization: Bearer <token>` when the client logged in with
`X-Auth-Mode: bearer`. Tokens expire after 7 days. The web app uses the
cookie only.

Error responses have the shape `{ "error": "message" }` (400/401/403/404/409/429)
or `{ "error": "Invalid request", "details": {...} }` for validation errors.
A body that is not JSON is `400` with `{ "error": "Invalid request" }` and no details.

## Auth

### `POST /auth/register`

```json
{ "email": "alice@example.com", "password": "password123", "displayName": "Alice" }
```

→ `201 { "user": { "id", "email", "display_name", "created_at" } }`

Also sets an httpOnly `cards_collect_session` cookie (SameSite=Lax, 7
days, `Secure` in production). The JSON does **not** include the JWT.

`password` must be 8-200 characters. Returns `409` if the email is already
registered.

Send `X-Auth-Mode: bearer` to also receive `"token"` in the JSON. That
header is for a non-browser client. The web app does not send it.

### `POST /auth/login`

```json
{ "email": "alice@example.com", "password": "password123" }
```

→ `200 { "user": {...} }` plus the same session cookie, or `401` on bad
credentials. `X-Auth-Mode: bearer` adds `"token"` to the body, same as
register.

### `POST /auth/logout` (auth required)

Clears the session cookie. → `204`.

### `GET /auth/session`

→ `200 { "user": null }` when the caller has no session, or `{ "user": {...} }`
when the cookie or bearer token is valid. A cookie from a disallowed
origin is treated as no session. This is the call the web app makes on
load. It does not respond with 401.

### `GET /auth/me` (auth required)

Accepts the session cookie or `Authorization: Bearer <token>`. → `200 { "user": {...} }` — the caller's own profile only.

A cookie-authenticated request whose `Origin` is not the app's origin is
`403`. A cookie-authenticated POST, PATCH, or DELETE with no `Origin` is
also `403`. Bearer requests are not checked this way. Register and login
require an allowed `Origin` unless the request sends `X-Auth-Mode: bearer`.

Register and login share a limit of 20 attempts per minute per socket
address. The response is `429` with `Retry-After: 60`. Proposing an
exchange is limited to 30 per minute per account, with the same status.

## Catalog (read-only, no auth required)

### `GET /catalog/universes`

→ `200 { "universes": [{ "id", "name", "slug", "notice" }] }`

`notice` is a short disclaimer for a sample catalog, or `null`. It is
derived from the slug, not stored on the universe row.

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
  "condition": "Mint | Near Mint | Excellent | Good | Played | Poor | null",
  "reserved": false,
  "exchange_id": "string | null",
  "has_front_image": false,
  "has_back_image": false,
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
{ "variantId": "...", "availability": "KEEP", "condition": "Near Mint" }
```

`variantId` required; `availability` defaults to `KEEP`; `condition` is
optional and must be one of the grades above (or omitted). Anything else
is `400`. → `201 { "copy": PublicCopy }`, or `400` for an unknown
`variantId`.

### `PATCH /my/collection/copies/:id`

```json
{ "availability": "TRADE", "condition": null }
```

Both fields optional. `condition: null` clears it. → `200 { "copy": PublicCopy }`. Returns **404** (not 403) if the copy doesn't exist _or_ belongs to another user — a caller
cannot distinguish the two, which is deliberate (see
[architecture.md](architecture.md#authentication--authorization)).

`PATCH` and `DELETE` return **409** when `reserved` is true. The copy is
committed to the exchange in `exchange_id`; cancel that exchange before
changing or removing the copy. `exchange_id` is null when the copy is free.

### `DELETE /my/collection/copies/:id`

→ `204` on success, `404` under the same rule as `PATCH`, `409` when the copy is reserved.
Deleting a copy also deletes its photos.

### `POST /my/collection/copies/:id/images/:side`

`:side` is `front` or `back`. The body is the raw JPEG or PNG, with
`Content-Type: image/jpeg` or `image/png`, at most 5 MB. The server checks
the bytes, strips metadata segments, and stores the file for that account
only. Replacing the same side overwrites it. An account can keep 200
photos. → `201 { "image": { "side": "front", "content_type": "image/jpeg" } }`.
`400` for another file type, `413` when it is too large, `404` when the
copy is not the caller's, `409` at the photo cap, `429` when this account
sends too many photos in a minute.

### `GET /my/collection/copies/:id/images/:side`

→ the image bytes for the owner. `401` without a session. `404` for anyone
else, or when that side has no photo. Public collection responses do not
include these URLs.

### `DELETE /my/collection/copies/:id/images/:side`

→ `204`. `404` under the same rule as `GET`.

### `POST /my/collection/identify`

Same raw JPEG or PNG body as an upload. This does not store the photo and
does not create a copy. With no recognition provider configured the
response is:

```json
{
  "status": "unavailable",
  "candidates": [],
  "message": "Automatic recognition is not available. Search for the card and confirm it yourself."
}
```

A future provider may return `"status": "candidates"` with up to eight
`{ "set_code", "number", "name", "confidence" }` objects. `confidence` is
between 0 and 1. The message tells the person to confirm the card. The
route never adds a copy from a guess. `400` for a file that is not a JPEG
or PNG. `429` after too many attempts in a minute.

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
      "collectible": { "id", "number", "name", "rarity", "metadata", "variants": [...] },
      "owned_quantity": 2,
      "duplicate_quantity": 1,
      "is_owned": true
    }
  ]
}
```

`checklist` covers every Collectible in the set, owned or not, so a client
can render the full set list from one call. `metadata` is the parsed JSON
object stored on the collectible, or `null`.

### `POST /my/sets/:id/copies` (auth required)

Adds physical copies for many collectibles in one set. The whole request
runs in one transaction.

```json
{ "collectible_ids": ["..."], "availability": "KEEP", "condition": null, "mode": "ensure_one" }
```

- `collectible_ids`: 1 to 200 ids. The same id may appear twice; `add`
  creates two copies, `ensure_one` creates at most one.
- `availability` defaults to `KEEP`. `condition` defaults to `null`.
- `mode` is `add` (default) or `ensure_one`. `ensure_one` skips a
  collectible the caller already owns and counts it in `skipped_count`.

→ `201 { "created_count": 18, "skipped_count": 2 }`

`404` if the set does not exist. `400` if any id is not in that set, a
card has no default variant, or more than 200 ids are sent.

### `PATCH /my/collection/copies/bulk` (auth required)

```json
{ "copy_ids": ["..."], "availability": "TRADE", "condition": "Played" }
```

1 to 200 unique ids. At least one of `availability` or `condition` is
required; `condition: null` clears it. → `200 { "updated_count": 3 }`.

The batch is one transaction. `404` if any id is missing or owned by
someone else (the response does not say which). `409` if any copy is
reserved. Neither case updates the others.

### `DELETE /my/collection/copies/bulk` (auth required)

```json
{ "copy_ids": ["..."] }
```

→ `200 { "deleted_count": 3 }`. Same 404/409 rules as the bulk patch: one
reserved or unknown id rejects the whole batch.

## Dashboard (auth required)

### `GET /my/dashboard`

Real aggregates only. The response is the object itself, not wrapped.

- `totals` — `set_count`, `started_set_count`, `total_count`,
  `owned_count`, `missing_count`, `duplicate_count`,
  `completion_percentage`, `copy_count`, `trade_copies`, `sell_copies`,
  `donation_copies`, `reserved_copies`. Completion is owned/total across
  the whole catalog, not an average of set percentages.
- `sets[]` — the same counts per set, plus `universe_id`, `universe_name`,
  `universe_slug`, `notice`, `release_date`, `code`, `name`.
- `highlights.trades` and `highlights.donations` — up to three each, only
  from sets the caller has started, ranked by score. Each row includes
  `you_receive_count`, `you_give_count`, previews of at most three cards,
  and completion before/after. Donations omit the other collector's
  completion. `open_exchange_id` is present when that match is already
  proposed.
- `exchanges` — `open_count`, `needs_action_count`, and `recent` (up to
  five `Exchange` views, newest update first). The caller needs to act
  when they are the counterparty on a proposal, or when the exchange is
  accepted and they have not confirmed.
- `recent_copies` — up to eight of the caller's copies, newest first.
  Includes the copy id. This route is owner-only.

The payload does not include email addresses.

## My matches (V0.2: ranked by Trade Score)

### `GET /my/matches?setId=<id>` (auth required)

`setId` is required — matching is always scoped to one Set. Results are
**pre-ranked** (highest `score` first — see
[architecture.md](architecture.md#trade-score-formula) for the formula and
the full tie-break order); the client does not need to sort. → `200`:

```json
{
  "matches": [
    {
      "collector": { "display_name": "Bob (Zoro Fan)", "ref": "opaque-token" },
      "type": "MUTUAL_TRADE",
      "score": 47,
      "current_user": {
        "cards_received": 2,
        "completion_before": 66.7,
        "completion_after": 75.0,
        "completion_gain": 8.3
      },
      "other_collector": {
        "cards_received": 1,
        "completion_before": 66.7,
        "completion_after": 70.8,
        "completion_gain": 4.1
      },
      "balance": { "difference": 1 },
      "proposed_exchange": {
        "you_receive": [{ "id", "number", "name", "rarity" }],
        "they_receive": [{ "id", "number", "name", "rarity" }]
      },
      "open_exchange_id": "present only when this pair already has an open exchange of this type"
    },
    {
      "collector": { "display_name": "Bob (Zoro Fan)", "ref": "opaque-token" },
      "type": "DONATION",
      "score": 20,
      "current_user": {
        "cards_received": 1,
        "completion_before": 66.7,
        "completion_after": 70.8,
        "completion_gain": 4.1
      },
      "proposed_exchange": {
        "you_receive": [{ "id", "number", "name", "rarity" }],
        "they_receive": []
      }
    }
  ]
}
```

- `type` is always exactly `"MUTUAL_TRADE"` or `"DONATION"` — a donation
  is never silently reframed as a one-sided trade, and vice versa. The
  same pair of collectors can appear as **two separate entries** (one of
  each type) if both a trade and a donation are independently possible
  between them — see architecture.md for why `TRADE` and `GIVE_AWAY`
  copies are tracked as independent pools.
- `other_collector` and `balance` are present **only** for
  `MUTUAL_TRADE`; `proposed_exchange.they_receive` is always `[]` for
  `DONATION` (never a fabricated reciprocal side).
- `completion_before`/`completion_after`/`score` are plain numbers on a
  0-100 scale (not the 0-1 fraction the pre-V0.2 shape used).
- `proposed_exchange` collectible refs use the same catalog identifiers
  as `/catalog/sets/:id/collectibles` — never a `UserCopy` id, which
  would identify one specific physical copy belonging to another user.
- Only collectors with at least one candidate (a possible trade or
  donation) are included — no zero-signal noise.
- `collector.ref` is an unguessable token for proposing an exchange. It
  is not an account id, not an email, and it is not returned by the
  public sharing API. `open_exchange_id` is omitted when there is no open
  exchange of that type with that collector. A copy reserved for someone
  else's exchange is not offered here.
- No email, account id, location, or other account metadata is ever
  included.

## My exchanges (auth required, participants only)

A structured trade or donation. No message body. See
[architecture.md](architecture.md#exchanges).

`type` is `MUTUAL_TRADE` or `DONATION`. `status` is `PROPOSED`,
`ACCEPTED`, `DECLINED`, `CANCELLED`, or `COMPLETED`. `role` is
`proposer` or `counterparty` from the caller's point of view. `actions`
is the list the caller may take right now (`accept`, `decline`, `cancel`,
`confirm`). Card objects are `{ "number", "name", "rarity", "condition" }`
snapshotted at proposal time — not `UserCopy` ids.

```json
{
  "id": "...",
  "type": "MUTUAL_TRADE",
  "status": "PROPOSED",
  "role": "counterparty",
  "set": { "id": "...", "name": "Starter Voyage", "code": "SV-01" },
  "other_collector": { "display_name": "Alice (Luffy Fan)", "ref": "opaque-token" },
  "you_give": [{ "number": "SV01-019", "name": "King of the Pirates' Ambition", "rarity": "SR", "condition": "Good" }],
  "you_receive": [{ "number": "SV01-010", "name": "Helmsman's Steady Hand", "rarity": "C", "condition": null }],
  "you_confirmed": false,
  "they_confirmed": false,
  "actions": ["accept", "decline"],
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

### `GET /my/exchanges`

→ `200 { "exchanges": [Exchange] }`, newest activity first. Only exchanges
where the caller is proposer or counterparty.

### `GET /my/exchanges/:id`

→ `200 { "exchange": Exchange }`. **404** if the id does not exist or the
caller is not a participant. Those two cases are the same response.

### `POST /my/exchanges`

```json
{ "set_id": "...", "collector_ref": "...", "type": "MUTUAL_TRADE" }
```

The server recomputes the match and chooses the copies. The client does
not send card ids. → `201 { "exchange": Exchange }`.

- `404` unknown set, or unknown `collector_ref`.
- `400` proposing an exchange with yourself, or a body that fails validation.
- `409` the match is no longer available, or an open exchange of this type
  already exists for this set and pair.

A `DONATION` is always requested by the person who would receive the
cards. Nothing is taken from them.

### `POST /my/exchanges/:id/accept`

### `POST /my/exchanges/:id/decline`

### `POST /my/exchanges/:id/cancel`

### `POST /my/exchanges/:id/confirm`

→ `200 { "exchange": Exchange }` when the action is legal. **404** for a
non-participant, same as `GET`. **409** when this person cannot take that
action in the current status (for example the proposer calling `accept`,
or anyone calling `confirm` before the exchange is `ACCEPTED`).

`confirm` is idempotent: calling it again after you have already confirmed,
including after `COMPLETED`, returns the current exchange. The other
actions are not idempotent.

Ownership transfers only when the second participant confirms. Decline and
cancel release every reserved copy without moving it. Received copies are
set to `KEEP`. Condition is unchanged.

This response shape replaces the pre-V0.2 `is_mutual_match` /
`you_can_receive` / `you_can_offer` / `donation_opportunities` /
`set_completion_before` shape — the same endpoint, evolved in place, not
a parallel matching API.

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

## Not implemented

Payments, shipping, checkout, public marketplace transactions, unrestricted
chat, in-app contact between collectors, precise location, and reputation
endpoints are intentionally absent — see the
[product scope](README.md#mvp-scope) and [risks.md](risks.md). Exchanges
record an agreement about specific copies. They do not arrange the handover.
