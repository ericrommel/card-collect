# Architecture

## Roadmap

```text
V0         — Collection tracking (owned/missing/duplicates/completion) + basic mutual-match/donation matching
V0.1       — Safe, revocable public collection sharing
V0.2       — Smart Trade Score: deterministic, explainable ranking of matches
Exchanges  — Propose, accept, and confirm a trade or donation. Copies move only after both people confirm.
```

Milestone numbers stop at V0.2. Later capabilities are named for what they
do. This document describes the architecture as it is, not a future plan.

Sections are labeled with the milestone that introduced them where it isn't
obvious from context.

## Stack

| Layer    | Choice                         | Why                                                                                                                                     |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | Node.js + TypeScript + Express | Boring, well-understood, minimal ceremony for a small API surface.                                                                      |
| Database | SQLite via Prisma              | Zero-install deterministic local dev; Prisma migrations give a clear upgrade path to Postgres later without rewriting the domain layer. |
| Auth     | JWT in an httpOnly cookie      | The web app never stores the token. A non-browser client can still ask for a bearer token. No server-side session store.                |
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
  collection/   a user's UserCopy CRUD, bulk copy changes, and per-set progress
  dashboard/    home summary assembled from catalog, copies, matches, and exchanges
  matching/     composes catalog + collection data through domain/matching.ts + domain/tradeScore.ts
  sharing/      per-set public share settings (auth) + public read-only lookup (no auth)
catalog/        original sample-catalog generator used by the seed (not a provider)
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
(`listUniverses`, `listSets`, `getSet`, `listCollectibles`, `searchCollectibles`). Catalog routes
read catalog rows only through that interface. A signed-in search then counts
that person's physical copies; the provider does not see user data, and a
missing session still returns the cards without a count. The dashboard also
counts set membership directly, because it needs ids and not full card bodies. V0 ships one
implementation, `LocalDbCatalogProvider`, backed by the seeded SQLite
database — the "small internal seeded database" option from the brief,
chosen over an external API adapter because it's the only option that gives
fully deterministic local dev and tests with no network dependency or
licensing exposure.

Swapping in a licensed external API later means writing a new class that
implements the same interface and normalizes/caches that API's responses —
no changes to routes, matching, or progress calculation.

Card names and numbers in the seed are original (see `server/prisma/seed.ts`
and `server/src/catalog/sampleCatalog.ts`). They are not copied from an
official card list. Two universes are seeded:

- `one-piece-card-game` / Starter Voyage (`SV-01`, 24 cards) — a small
  synthetic set with the original Alice/Bob trade and Bob's donation.
- `harbor-atlas` / Lantern Harbor (`HA-01`, 180), Glass Market (`HA-02`,
  120), and North Archive (`HA-03`, 96) — an original large catalog so the
  collection screen can be tried with hundreds of cards.

`sampleNoticeForSlug` attaches a disclaimer to those slugs. The database
does not store the notice. Unknown slugs get `null`, so a future licensed
catalog is not stamped with the sample warning.

The web app draws a geometric SVG from the card number and name
(`web/src/components/CardFace.tsx`). That is not catalog artwork. See
[decisions.md](decisions.md) and
[risks.md](risks.md#p1--official-card-image-rights).

## Collection explorer and dashboard

`GET /api/my/dashboard` is the signed-in home. Totals are sums over real
rows. Overall completion is owned collectibles divided by every catalogued
collectible, including sets the user has not started. Match highlights are
computed only for sets with `owned_count > 0`, then cut to the top three
trades and top three donations. An untouched set can still have donations;
those stay on that set's Matches page. Home shows the same sets with
started collections first, then by how many cards are owned. That order is
applied in the browser. The API list stays in release order.

`/sets/:setId` loads the progress checklist and the caller's copies once.
Search, filters, and sort run in the browser. Bulk adds, updates, and
deletes go to the bulk copy routes, at most 200 ids per request. The
server applies one batch in a single transaction and rejects the whole
batch when any copy is not the caller's or is reserved, so a partial
update cannot stick. See [api.md](api.md).

`/add` searches the whole catalog, then saves one copy only after the
person picks availability and condition. An optional photo stays private.
`/sets/:setId/add` is that same one-card flow for someone already in a
set. Marking many cards at once stays a bulk action on the set page.
`modules/identification/cardIdentifier.ts` is the replaceable
recognition provider. The default reports that recognition is unavailable
and does not invent a card. `modules/images/` checks JPEG and PNG bytes,
strips metadata segments, and stores the file under `server/data/copy-images/`
(not in the database and not on a public route). Only the owner can read
it. Completing an exchange deletes the photos instead of transferring them.

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
   side's snapshot (`totalCount`, `ownedCount`, and how many copies they
   have of each card) into a `TradeScoreBreakdown`. Projected completion
   comes from `domain/progress.ts#ownedCountAfterTransfer`: a received
   card you do not have adds one, and a card you give away drops off only
   when no copy would remain. It is computed in memory and never writes
   `UserCopy`.
3. **Ranking** (`domain/tradeScore.ts#compareMatches`) — sorts the full
   list; see "Ranking and tie-breaking" below.

What leaves this function: `display_name`, an opaque `collector.ref`
(144-bit token, not the account id — see Exchanges below), catalog
collectible identifiers (never a `UserCopy` id), and progress numbers.
No email, account id, or contact info. A copy reserved for an open
exchange is hidden from everyone except the two people in that exchange,
whose match stays visible and carries `open_exchange_id`. This is the
same function/endpoint from V0, evolved in place — not a parallel
matching implementation.

### Trade Score formula

The score is a **collection-usefulness index, not a measure of objective
market or financial trade fairness** — it only ever looks at how much
closer each side gets to completing the set, using data the app already
has (missing cards, `TRADE`/`GIVE_AWAY` copies, completion before/after).
Full implementation: `domain/tradeScore.ts`.

1. **Per side, compute the raw completion gain** in percentage points
   on the set's own scale: `completionAfter - completionBefore`.
   `completionAfter` is the distinct cards that person would own once
   the copies move. Receiving a missing card adds one. Giving a card
   subtracts one only when they would have none left. A spare copy
   staying behind does not change the count. A negative gain is still
   shown, and it contributes 0 to the scaled score below, so trading
   away your only copy does not rank as if the set had grown.
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
4. the other collector's `display_name`, ascending — a stable,
   business-meaningful field, never a raw database id or the database's
   incidental row order;
5. the opaque collector ref, ascending, so two people who chose the same
   display name still sort deterministically. The ref is not an account id.

No step is random, and the underlying `prisma.user.findMany` enumeration
order (`orderBy: { id: "asc" }`) only matters as a starting point —
`compareMatches` fully determines the final order for any set of inputs.

## Authentication / authorization

- Passwords are hashed with bcrypt. A session is a JWT (7-day expiry)
  verified by `middleware/requireAuth.ts`.
- The web app does not store that JWT. Login and register set an httpOnly,
  SameSite=Lax cookie (`cards_collect_session`). A non-browser client that
  sends `X-Auth-Mode: bearer` also receives the token in JSON and sends it
  back as `Authorization: Bearer`. That is the path a future mobile app
  should use, with the token in secure on-device storage. The web client
  never asks for bearer mode, so a script running in the page cannot read
  the session out of the login response or out of `localStorage`.
- A request authenticated by the cookie is rejected when its `Origin` is
  not the app. Outside production, localhost on any port is allowed so the
  dev server can move. Safe reads still accept a missing Origin. A cookie
  write (POST, PATCH, DELETE) does not: the browser sends Origin on those,
  and a missing one is rejected. Sign-in and registration follow the same
  rule unless the client sends `X-Auth-Mode: bearer`. That header cannot
  ride on a cross-site form post; it forces a CORS preflight, and the API
  only allows the configured app origin. Bearer requests are not
  origin-checked; they are the explicit non-browser credential.
- Sign-in and registration share a limit of 20 attempts per minute per
  socket address. Proposing an exchange is limited to 30 per minute per
  account. Changing a password is limited to 10 attempts per minute per
  account. The process does not trust `X-Forwarded-For` (`trust proxy` is
  off), so a client cannot pick its own rate-limit key. The suite raises
  the sign-in limit while `VITEST` is set.
- Each token carries the account's session version (`sv`). Signing out, or
  changing the password, increments that version. Older cookies and bearer
  tokens then fail as an invalid session. Password change issues a new
  session for the browser that sent the current password, so that browser
  stays signed in. There is no per-device session list and no email reset.
  A token that omits `sv` is rejected, including tokens issued before this
  check existed. The profile JSON never includes the version or the
  password hash.
- API responses send `nosniff`, `no-referrer`, `DENY` framing, `no-store`,
  and `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
  They do not send `X-Powered-By`.
  The Vite dev server does not use that policy, because its own scripts
  would break. A host that serves the built web app needs to set framing
  and nosniff itself. The HTML sets `referrer` to `no-referrer`.
- Every `my/*` route requires the cookie or a bearer token and scopes all
  reads/writes to `req.userId` from that token — never from a client-supplied id.
- Cross-user mutation of a `UserCopy` is blocked by ownership check in
  `collection/routes.ts#loadOwnedCopyOrNotFound`, which returns **404** (not 403) when the copy belongs to someone else — this avoids letting a client
  distinguish "not yours" from "doesn't exist" by response code, a basic
  IDOR/BOLA mitigation. Covered by
  `server/tests/integration/authorization.test.ts`.
- API responses are shaped explicitly (`toSelfProfile`, `toPublicCopy`,
  `toPublicMatch` in matching) rather than returning raw Prisma rows, so
  it's structurally impossible to accidentally leak `passwordHash` or
  another user's email through a route that wasn't reviewed for it.

## Exchanges

A match is a suggestion. An exchange is the agreement. `modules/exchanges/`
lets the signed-in user turn one match into a proposal the other collector
can accept, decline, or later confirm. There is no message field, no
email, and no location: the product does not become a way for two people
to contact each other.

### Why this lifecycle

```text
PROPOSED → ACCEPTED → COMPLETED
         → DECLINED
         → CANCELLED
```

- **PROPOSED.** The person who can see the match asks. The server
  recomputes the candidate with the same rules as matching
  (`findMutualTradeCandidate` / `findDonationCandidate`) and pins one
  physical copy per collectible. The client does not send a card list, so
  it cannot ask for cards the match would not have included.
- **ACCEPTED.** The other person agrees to those exact copies. Nothing in
  either collection changes yet.
- **COMPLETED.** Each person confirms the cards have actually changed
  hands. Only the second confirmation transfers `ownerId`. Received copies
  are reset to `KEEP` so a card you just got is not silently left on offer.
  User-entered condition is preserved.
- **DECLINED / CANCELLED.** The counterparty can decline a proposal. The
  proposer can cancel a proposal. After acceptance, either person can
  cancel until both have confirmed. Copies are released and stay with
  their owner. There is no penalty score.

There is no `IN_PROGRESS` status. The app does not ship cards or take
payment, so a middle state would describe something the system cannot
observe. Dual confirmation is the whole "did the handover happen" signal,
and it is an honor system — see the risk register. Cancelling stays
available until both confirm so nobody is stuck in a deal, including a
younger user who changes their mind.

### Which copy, and reservation

When several eligible copies of one collectible exist, the oldest
unreserved copy is the one committed (`createdAt`, then id). A newer
duplicate stays free. While an exchange is `PROPOSED` or `ACCEPTED`, each
committed copy has `reservedByExchangeId` set:

- it cannot be deleted or have its availability or condition changed (409);
- matching ignores it for everyone except the two participants, who still
  see the match with `open_exchange_id`;
- a second open exchange of the same type, set, and pair is rejected.

`TRADE` copies are the only copies a mutual trade can reserve. `GIVE_AWAY`
copies are the only copies a donation can reserve. A donation takes
nothing from the person who asked.

### Addressing the other collector

Matches and exchanges identify the other person by `collector.ref` /
`other_collector.ref`, a `publicId` generated the same way as a share
token (`lib/opaqueId.ts`). It is not the account id, it is not accepted as
a login, and public share pages do not include it. Guessing one is not
practical (144 bits). A ref that does not exist and a request for an
exchange you are not part of are both **404**.

### Condition

A physical copy can carry a user-entered condition: Mint, Near Mint,
Excellent, Good, Played, or Poor, or unset. The exchange snapshots that
value onto each line so both people see what was offered. Condition does
not affect the Trade Score. It is not a professional grade and not an AI
estimate. Public share pages still do not include it — `PublicShareInput`
has to gain a field before it can appear there.

### What an exchange response contains

Display name, opaque ref, set name and code, the snapshotted card labels
(number, name, rarity, condition), status, whose turn it is (`actions`),
and the two confirmation flags. No email, no account id, no `UserCopy` id.
The web client renders `actions` from the server so it does not reimplement
the state machine.

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
- **A public request honors `enabled` and `expiresAt`.** Turning sharing
  on starts a 30-day window. Disabling clears that time and flips
  `enabled: false`. Regenerating rotates `shareId` and, when sharing is
  on, starts a new window. Renewing keeps `shareId` and starts a new
  window from that moment. A disabled row, an expired row, an old
  `shareId`, and a `shareId` that was never created are **all** a 404
  from `GET /api/public/collections/:shareId` — the same "don't let a
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
  verification status, the user-entered `condition` that exchanges do
  show to the two participants, anything — cannot leak through this path,
  because there is no code that forwards a Prisma object into the
  response; every field has to be deliberately threaded through
  `PublicShareInput` first. Condition is intentionally not threaded.
- **No location, age, or contact fields exist anywhere in the schema**,
  so there's nothing for the public endpoint to accidentally expose on
  that front in V0 — `server/tests/integration/sharing.test.ts` asserts
  the response never contains location-shaped keys as a regression
  guard, not because a leak is currently possible.
- **The public endpoint is GET-only.** `modules/sharing/publicRoutes.ts`
  registers a single `GET /:shareId` route; there is no PUT/POST/DELETE
  on `/api/public/*`. A successful GET writes two fields on that share
  row: how many times the page loaded, and when. It does not record who
  opened it, and it does not change cards, visibility, or the link. A
  miss does not write. The public JSON omits the count. A second load
  within one second is not written again. At most 60 writes happen per
  link per minute in this process; later opens still return the page.
- **The site asks crawlers not to index it.** `web/index.html` includes
  `noindex, nofollow`, and the dev server sends the same `X-Robots-Tag`.
  A crawler that does not run JavaScript still receives that tag with the
  generic page, not a collection. The public page also sets the tag after
  it renders. Sharing means "anyone with the link," not "publicly listed."
  See the risk in [risks.md](risks.md): during those 30 days, link
  possession is still the only access control. The owner can see a count
  and a last-opened time, not who opened the link.
  A production host should keep that header when it serves the built files.

## How a future mobile client fits

The backend has no web-only assumptions: JSON in/out, and all business
logic lives server-side in `domain/` and `modules/*/service.ts`. The web
client keeps its session in an httpOnly cookie. A future Android/iOS
client uses the same routes with a bearer token. It would:

- send `X-Auth-Mode: bearer` on login and store that JWT in secure
  on-device storage, not in a web view's `localStorage`;
- call the same `catalog`, `my/collection`, `my/sets/:id/progress`,
  `my/matches`, `my/exchanges`, and `my/sets/:id/share` endpoints
  documented in [docs/api.md](docs/api.md) — a native share sheet would
  just point at the same `public_url` the web client constructs from
  `share_id`;
- add its own camera UI on top of `POST /my/collection/copies` and
  `POST /my/collection/identify`. The web app already does that with the
  file input. Recognition stays behind `CardIdentifier`.

No mobile-specific backend changes are anticipated before that point.

The current client can be installed from a browser (`web/public/manifest.webmanifest` and `web/public/sw.js`). The installed item is this website. The service worker does not cache `/api` responses, so a home-screen icon does not keep a private offline collection.
