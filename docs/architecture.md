# Architecture — V0

## Stack

| Layer    | Choice                                    | Why                                                                                   |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Backend  | Node.js + TypeScript + Express             | Boring, well-understood, minimal ceremony for a small API surface.                     |
| Database | SQLite via Prisma                          | Zero-install deterministic local dev; Prisma migrations give a clear upgrade path to Postgres later without rewriting the domain layer. |
| Auth     | JWT (bcrypt-hashed passwords)               | Stateless bearer tokens work identically for a browser and a future native mobile client; no server-side session store to run. |
| Frontend | React + Vite + TypeScript                   | Standard SPA toolchain; talks to the API over plain JSON, no server-rendering coupling. |
| Tests    | Vitest + Supertest                          | Fast, TypeScript-native; Supertest drives the real Express app for integration/authorization tests. |

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
                  progress.ts   — completion/duplicate calculations
                  matching.ts   — mutual-match / donation computation
modules/
  auth/         registration, login, JWT issuance, password hashing
  catalog/      CatalogProvider abstraction + its local-DB implementation
  collection/   a user's UserCopy CRUD + per-set progress
  matching/     combines catalog + collection data through domain/matching.ts
middleware/     requireAuth, centralized error handling, async wrapper
```

`domain/` has no dependency on Express, Prisma, or HTTP — `progress.ts` and
`matching.ts` are pure functions over plain objects, which is what makes them
cheap to unit test (see `server/tests/domain/`) and safe to reuse if a
mobile-specific backend surface is ever added.

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

## Matching flow

`modules/matching/service.ts` → `computeMatchesForUser(userId, setId)`:

1. Load the Set's Collectibles once via `CatalogProvider`.
2. Compute the requesting user's missing-collectible set via
   `domain/progress.ts`.
3. For every other user: compute their missing-collectible set the same
   way, and their `TRADE`/`GIVE_AWAY` copies (`KEEP` and `SELL` are never
   offered — see `collection/service.ts#isOfferable`).
4. Pass both users' missing sets and offerable copies into
   `domain/matching.ts#computeMatch`, which is the actual match logic:
   - `you_can_receive` = the other user's offerable copies that cover what
     I'm missing.
   - `you_can_offer` = my offerable copies that cover what they're missing.
   - `is_mutual_match` = both non-empty.
   - `donation_opportunities` = the `GIVE_AWAY` subset of `you_can_receive`,
     computed independently of `you_can_offer` so a one-way donation still
     surfaces even when I have nothing to trade back.
5. Results with no signal in either direction are dropped from the response.

Only `display_name`, card identities, and availability ever leave this
function — no email, user id, or other account metadata.

## Authentication / authorization

- Passwords are hashed with bcrypt; sessions are JWT bearer tokens (7-day
  expiry) verified by `middleware/requireAuth.ts`.
- Every `my/*` route requires a valid token and scopes all reads/writes to
  `req.userId` pulled from that token — never from a client-supplied id.
- Cross-user mutation of a `UserCopy` is blocked by ownership check in
  `collection/routes.ts#loadOwnedCopyOrNotFound`, which returns **404** (not
  403) when the copy belongs to someone else — this avoids letting a client
  distinguish "not yours" from "doesn't exist" by response code, a basic
  IDOR/BOLA mitigation. Covered by
  `server/tests/integration/authorization.test.ts`.
- API responses are shaped explicitly (`toSelfProfile`, `toPublicCopy`,
  `enrich` in matching) rather than returning raw Prisma rows, so it's
  structurally impossible to accidentally leak `passwordHash` or another
  user's email through a route that wasn't reviewed for it.

## How a future mobile client fits

The backend has no web-only assumptions: JSON in/out, bearer-token auth
(no cookies), and all business logic lives server-side in `domain/` and
`modules/*/service.ts` — the web client in `web/` is a thin consumer of the
same `/api/*` routes a mobile app would use. A future Android/iOS client
would:

- store the JWT from `/api/auth/login` in secure on-device storage instead
  of `localStorage`;
- call the same `catalog`, `my/collection`, `my/sets/:id/progress`, and
  `my/matches` endpoints documented in [docs/api.md](docs/api.md);
- add its own camera/scanning UI on top of `POST /my/collection/copies` —
  scanning is out of scope for V0, but the copy-creation endpoint it would
  feed into already exists and doesn't assume a particular input method.

No mobile-specific backend changes are anticipated before that point.
