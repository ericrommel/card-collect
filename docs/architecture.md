# Architecture

## Roadmap

```text
V0    — Collection tracking (owned/missing/duplicates/completion) + basic mutual-match/donation matching
V0.1  — Safe, revocable public collection sharing
V0.2  — Smart Trade Score: deterministic, explainable ranking of matches
```

This document covers the cumulative architecture through V0.2. Sections
are labeled with the milestone that introduced them where it isn't
obvious from context.

## Stack

| Layer    | Choice                         | Why                                                                                                                                     |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | Node.js + TypeScript + Express | Boring, well-understood, minimal ceremony for a small API surface.                                                                      |
| Database | SQLite via Prisma              | Zero-install deterministic local dev; Prisma migrations give a clear upgrade path to Postgres later without rewriting the domain layer. |
| Auth     | JWT (bcrypt-hashed passwords)  | Stateless bearer tokens work identically for a browser and a future native mobile client; no server-side session store to run.          |
| Frontend | React + Vite + TypeScript      | Standard SPA toolchain; talks to the API over plain JSON, no server-rendering coupling.                                                 |
| Tests    | Vitest + Supertest             | Fast, TypeScript-native; Supertest drives the real Express app for integration/authorization tests.                                     |

This is a **modular monolith**: one deployable backend, organized into
domain-oriented modules, not a set of services. Microservices would add
operational overhead with no corresponding benefit at V0's scale.

## Domain model

```text
CollectibleUniverse  (e.g. "One Piece Card Game")
  -> Set              (e.g. "Starter Voyage")
      -> Collectible   (e.g. "SV01-019 King of the Pirates' Ambition")
          -> Variant   (e.g. "Base", "Manga Rare")
              -> UserCopy  (one physical copy owned by one user)
```

- **CollectibleUniverse / Set / Collectible / Variant** hold catalog data —
  shared, not owned by any one user.
- **UserCopy** is the only user-owned row in the catalog side of the model:
  one row per physical copy. Multiple `UserCopy` rows pointing at the same
  `Variant` for the same owner are duplicates by construction — there is no
  separate "quantity" field to keep in sync.
- Completion/progress is measured over distinct **Collectibles** owned, not
  `UserCopy` rows or `Variant`s — owning three copies of one card, or two
  different variants of it, still counts once toward completion. This
  satisfies the "duplicates must not inflate completion" requirement
  directly from the data shape rather than from special-cased logic.
- `CollectionSeries` from the original design sketch (a grouping above
  `Set`) was **not** implemented in V0 — nothing in the seeded data needed
  it, and adding an unused table would be speculative. `Set.universeId`
  going straight to `CollectibleUniverse` is enough; introducing
  `CollectionSeries` later is a additive, backward-compatible migration.
- `Availability` (`KEEP | TRADE | SELL | GIVE_AWAY`) is stored as a plain
  string column, not a database enum — SQLite has no native enum type. The
  zod schemas at the API boundary (`modules/collection/routes.ts`) are the
  actual source of truth for valid values; this also means switching to
  Postgres later (which does support enums) is a schema change, not a
  domain-model change.

## Module boundaries (`server/src`)

```text
domain/         Pure, framework-free business logic (no I/O):
                  progress.ts     — completion/duplicate calculations
                  matching.ts     — WHICH collectibles could move between two collectors (candidate generation)
                  tradeScore.ts   — scores a candidate + ranks/tie-breaks the resulting list (V0.2)
                  sharingView.ts  — builds the public share DTO from a narrow input type
modules/
  auth/         registration, login, JWT issuance, password hashing
  catalog/      CatalogProvider abstraction + its local-DB implementation
  collection/   a user's UserCopy CRUD + per-set progress
  matching/     composes catalog + collection data through domain/matching.ts + domain/tradeScore.ts
  sharing/      per-set public share settings (auth) + public read-only lookup (no auth)
middleware/     requireAuth, centralized error handling, async wrapper
```

`domain/` has no dependency on Express, Prisma, or HTTP — every file in it
is pure functions over plain objects, which is what makes them cheap to
unit test (see `server/tests/domain/`) and safe to reuse if a
mobile-specific backend surface is ever added. `matching.ts` (candidate
generation) and `tradeScore.ts` (scoring + ranking) are intentionally
separate files: matching.ts decides _whether_ an exchange is possible at
all, tradeScore.ts decides _how good_ it is — neither one needs to know
how the other works, and `matching.test.ts` / `tradeScore.test.ts` test
them independently.

Each `modules/*` folder owns one bounded concern and talks to the database
only for its own concern — e.g. `collection/service.ts` never reaches into
`matching` internals, `matching/service.ts` composes `catalog` +
`collection` read functions rather than querying Prisma directly for
things those modules already expose.

## Catalog provider abstraction

External catalog licensing is an [open risk](risks.md#p1--catalog-data-licensing).
`modules/catalog/catalogProvider.ts` defines a `CatalogProvider` interface
(`listUniverses`, `listSets`, `getSet`, `listCollectibles`); nothing outside
`modules/catalog/` imports Prisma models for catalog reads. V0 ships one
implementation, `LocalDbCatalogProvider`, backed by the seeded SQLite
database — the "small internal seeded database" option from the brief,
chosen over an external API adapter because it's the only option that gives
fully deterministic local dev and tests with no network dependency or
licensing exposure.

Swapping in a licensed external API later means writing a new class that
implements the same interface and normalizes/caches that API's responses —
no changes to routes, matching, or progress calculation.

Card names/numbers in the seed data are original synthetic content (see
`server/prisma/seed.ts`), not copied from the official card list, to avoid
any dependency on licensed catalog text — see
[risks.md](risks.md#p1--official-card-image-rights).

## Matching flow (V0.2: candidates → score → rank)

`modules/matching/service.ts` → `computeMatchesForUser(userId, setId)`
composes three independent steps for every other user in the system:

1. **Candidate generation** (`domain/matching.ts`) — decides _whether_ an
   exchange is possible, from each side's per-set missing-collectible set
   (`domain/progress.ts`) and availability-tagged copies:
   - `findMutualTradeCandidate` — a candidate exists only when **both**
     directions are non-empty, using **only `TRADE`-availability copies
     on both sides**. One-sided `TRADE` availability produces no
     candidate — never silently reframed as a donation.
   - `findDonationCandidate` — the other collector's **`GIVE_AWAY`-only**
     copies that cover what I'm missing. Always one-way; there is no code
     path that promotes a donation into a trade.
   - `TRADE` and `GIVE_AWAY` are tracked as fully independent pools per
     physical copy — owning one of each of the same collectible makes it
     eligible for _both_ a trade and a donation (as different physical
     copies), never double-counted as one. `KEEP` and `SELL` copies are
     never read by either function.
2. **Scoring** (`domain/tradeScore.ts`) — turns a candidate plus each
   side's `{totalCount, ownedCount}` snapshot into a `TradeScoreBreakdown`
   (score + the structured components below), via
   `domain/progress.ts#estimateCompletionAfter` for the projected
   completion — computed in memory from plain numbers, never by writing
   to `UserCopy` or reading it back.
3. **Ranking** (`domain/tradeScore.ts#compareMatches`) — sorts the full
   list; see "Ranking and tie-breaking" below.

Only `display_name`, catalog collectible identifiers (never a `UserCopy`
id), and progress numbers ever leave this function — no email, user id,
or other account metadata. This is the same function/endpoint from V0,
evolved in place — not a parallel matching implementation.

### Trade Score formula

The score is a **collection-usefulness index, not a measure of objective
market or financial trade fairness** — it only ever looks at how much
closer each side gets to completing the set, using data the app already
has (missing cards, `TRADE`/`GIVE_AWAY` copies, completion before/after).
Full implementation: `domain/tradeScore.ts`.

1. **Per side, compute the raw completion gain** in percentage points
   (0-100) on the set's own scale: `completionAfter - completionBefore`,
   where `completionAfter` comes from `estimateCompletionAfter` given the
   candidate's proposed collectibles.
2. **Scale each gain with a square root:**
   `scaledGain = 100 * sqrt(rawGainPercent / 100)`. This is the one
   nonlinear step in the formula, and it exists for a specific reason: a
   raw percentage-of-set-size gain is dominated by set size (a 5-card
   gain is huge on a 10-card set and tiny on a 200-card set) and, even
   within one set, linear scaling makes the score read as "basically a
   card count," which the milestone explicitly asks to avoid. Square
   root is monotonic (every "more gain → higher score" property below
   still holds exactly) but compresses the top of the range and expands
   the bottom, so a modest, genuinely useful gain still lands in a
   legible, non-trivial part of the 0-100 scale instead of clustering
   near 0.
3. **`DONATION` score = `round(scaledGain(currentUser))`, clamped to
   [0, 100].** One-sided by construction: no balance factor, no bonus.
4. **`MUTUAL_TRADE` score:**
   - `base = average(scaledGain(currentUser), scaledGain(otherCollector))`
   - `balanceRatio = min(scaledCurrent, scaledOther) / max(scaledCurrent, scaledOther)`
     (1.0 = perfectly balanced, → 0 = one side gets almost nothing)
   - `balanceMultiplier = 0.4 + 0.6 * balanceRatio` (ranges 0.4–1.0) — an
     unbalanced trade is never zeroed out (it's still a real trade that
     helps someone), but a severely unbalanced one is capped well below
     a balanced trade of the same average benefit.
   - `score = round(base * balanceMultiplier * 1.15)`, clamped to
     [0, 100]. The flat **1.15× reciprocity bonus** is what makes a
     mutual trade generally outrank an equal-benefit one-way donation —
     helping both collectors is worth more than delivering the same
     benefit to only one of them.
5. Every constant above (`0.4` balance floor, `1.15` reciprocity bonus,
   the sqrt scaling) is a named constant at the top of `tradeScore.ts`,
   not inlined magic numbers — tune them there if the ranking ever needs
   to feel different, without touching candidate generation or the API
   shape.

This formula is deliberately simple enough to hand-verify: given two
sides' owned/total counts and a candidate's card lists, you can compute
the score with a calculator. `server/tests/domain/tradeScore.test.ts`
pins down the required properties (more gain → higher score; balanced
beats severely unbalanced at equal average benefit; a mutual trade beats
an equivalent donation; determinism) rather than exact score values, so
the constants can be retuned later without every test needing a rewrite.

### Structured breakdown (explainability)

Every match includes enough structure for a client to explain the score
without recomputing it — see `docs/api.md` for the exact JSON. In short:
`type` (`MUTUAL_TRADE` | `DONATION`), `current_user` /
`other_collector` (`cards_received`, `completion_before`,
`completion_after`, `completion_gain`), `balance.difference` (mutual
trades only), and `proposed_exchange.you_receive` /
`proposed_exchange.they_receive` as catalog `CollectibleRef`s
(`id`/`number`/`name`/`rarity` — never a `UserCopy` id).

### Ranking and tie-breaking

`domain/tradeScore.ts#compareMatches`, applied to the full result list
before it leaves `computeMatchesForUser`:

1. highest `score`;
2. largest `current_user.completion_gain`;
3. largest "mutual" completion gain — `other_collector.completion_gain`
   for a `MUTUAL_TRADE`, or `0` for a `DONATION` (which has no other
   side);
4. the other collector's `display_name`, ascending — chosen as the final
   tie-breaker specifically because it is a stable, business-meaningful
   field, never a raw database id or the database's incidental row
   order (explicitly disallowed by the milestone). Two collectors
   sharing an identical display name is the only case left
   under-specified; it isn't reachable with the current seed data and
   isn't guarded against separately.

No step is random, and the underlying `prisma.user.findMany` enumeration
order (`orderBy: { id: "asc" }`) only matters as a starting point —
`compareMatches` fully determines the final order for any set of inputs.

## Authentication / authorization

- Passwords are hashed with bcrypt; sessions are JWT bearer tokens (7-day
  expiry) verified by `middleware/requireAuth.ts`.
- Every `my/*` route requires a valid token and scopes all reads/writes to
  `req.userId` pulled from that token — never from a client-supplied id.
- Cross-user mutation of a `UserCopy` is blocked by ownership check in
  `collection/routes.ts#loadOwnedCopyOrNotFound`, which returns **404** (not 403) when the copy belongs to someone else — this avoids letting a client
  distinguish "not yours" from "doesn't exist" by response code, a basic
  IDOR/BOLA mitigation. Covered by
  `server/tests/integration/authorization.test.ts`.
- API responses are shaped explicitly (`toSelfProfile`, `toPublicCopy`,
  `toPublicMatch` in matching) rather than returning raw Prisma rows, so
  it's structurally impossible to accidentally leak `passwordHash` or
  another user's email through a route that wasn't reviewed for it.

## Collection sharing (V0.1)

A user can publish a limited, read-only, revocable view of their progress
for one Set — `modules/sharing/`. Design decisions:

- **Scoped to (owner, set), not "the whole collection".** Every field the
  milestone asks to expose (completion %, owned, missing, duplicates,
  trade/give-away offers) is already computed per-set by
  `domain/progress.ts`. A `CollectionShare` row is unique on
  `(ownerId, setId)` — at most one share configuration per user per set —
  which keeps the feature a direct extension of the existing progress
  model instead of inventing a separate cross-set "collection" concept
  V0 doesn't otherwise have.
- **The public token is not the row's id.** `shareId` (a 24-character
  `crypto.randomBytes(18)` base64url string, see
  `modules/sharing/shareId.ts`) is a separate column from the row's cuid
  `id`. This is what makes "regenerate" a clean operation: rotating the
  public link is just overwriting `shareId` on the same row, so the
  owner's visibility preferences survive a rotation. It also means the
  public URL never reveals or depends on an internal database id.
- **`enabled` is the only thing a public request honors.** Disabling
  ("revoke") just flips `enabled: false`; regenerating rotates `shareId`
  without touching `enabled`. A disabled row's old `shareId` and a
  `shareId` that was never created are **both** a 404 from
  `GET /api/public/collections/:shareId` — the same "don't let a
  response distinguish revoked from never-existed" rule already used for
  `UserCopy` ownership checks (see Authentication / authorization below),
  now applied to a link an attacker might be guessing or replaying.
- **No IDOR surface to guard against for the owner-facing routes.** Unlike
  `UserCopy`, which is addressed by its own id and therefore needs the
  404-on-mismatch pattern, the `/api/my/sets/:id/share*` routes take no
  id that could belong to another user — `setId` is public catalog data
  and the owner is always `req.userId` from the JWT. There is structurally
  no request shape through which user B could address user A's share row.
  `server/tests/integration/sharing.test.ts` proves this behaviorally
  (B's writes never affect A's row) rather than via a guessable-id check,
  because there is no guessable id in this path.
- **The public response is built from an explicit DTO, not a Prisma
  row.** `domain/sharingView.ts#buildPublicShareView` takes a narrow,
  hand-written `PublicShareInput` type (display name, card refs, counts)
  and returns only the fields the owner's visibility flags allow. Adding
  a new column to `User`, `UserCopy`, or `CollectionShare` later — email
  verification status, a future `condition` detail, anything — cannot
  leak through this path, because there is no code that forwards a
  Prisma object into the response; every field has to be deliberately
  threaded through `PublicShareInput` first.
- **No location, age, or contact fields exist anywhere in the schema**,
  so there's nothing for the public endpoint to accidentally expose on
  that front in V0 — `server/tests/integration/sharing.test.ts` asserts
  the response never contains location-shaped keys as a regression
  guard, not because a leak is currently possible.
- **The public endpoint is GET-only.** `modules/sharing/publicRoutes.ts`
  registers a single `GET /:shareId` route; there is no PUT/POST/DELETE
  on `/api/public/*` at all, so "public endpoints cannot mutate
  collection data" holds because the route table makes it impossible,
  not because of a runtime permission check.
- **The web client marks the public page `noindex, nofollow`**
  (`web/src/pages/PublicCollection.tsx`) so a shared link isn't
  accidentally picked up by a search-engine crawler — sharing here means
  "anyone with the link," not "publicly listed." See the new risk logged
  in [risks.md](risks.md) about link possession being the only access
  control in V0.1 (no expiry, no per-viewer restriction).

## How a future mobile client fits

The backend has no web-only assumptions: JSON in/out, bearer-token auth
(no cookies), and all business logic lives server-side in `domain/` and
`modules/*/service.ts` — the web client in `web/` is a thin consumer of the
same `/api/*` routes a mobile app would use. A future Android/iOS client
would:

- store the JWT from `/api/auth/login` in secure on-device storage instead
  of `localStorage`;
- call the same `catalog`, `my/collection`, `my/sets/:id/progress`,
  `my/matches`, and `my/sets/:id/share` endpoints documented in
  [docs/api.md](docs/api.md) — a native share sheet would just point at the
  same `public_url` the web client constructs from `share_id`;
- add its own camera/scanning UI on top of `POST /my/collection/copies` —
  scanning is out of scope for V0, but the copy-creation endpoint it would
  feed into already exists and doesn't assume a particular input method.

No mobile-specific backend changes are anticipated before that point.
