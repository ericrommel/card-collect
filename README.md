# Cards Collect

A safety-first collectible-card collection and exchange platform.

Signed-in collectors land on a dashboard of their sets, completion, duplicates,
matches, and exchanges. Each set opens as a card grid: search, filter, select
many cards, and add or update copies in one action. A list view is available
when a grid is the wrong shape.

Two sample catalogs ship with the seed. **Starter Voyage** is a 24-card
synthetic set. **Harbor Atlas** is an original 396-card catalog (three sets)
for trying a large collection. Neither is an official product, and the card
faces are generated patterns, not publisher artwork. The domain model stays
generic (see [docs/architecture.md](docs/architecture.md) and
[docs/decisions.md](docs/decisions.md)).

```text
V0         — Collection tracking (owned/missing/duplicates/completion) + matching
V0.1       — Safe, revocable public collection sharing
V0.2       — Smart Trade Score: deterministic, explainable ranking of matches
Exchanges  — Propose, accept, and confirm a trade or donation
Explorer   — Dashboard, visual collection browser, bulk copy changes, large sample catalog
```

Users track a collection, see what they own, miss, and have duplicated, mark
physical copies with an availability state, and get matched with other
collectors for mutually useful trades or one-way donations — ranked by a
deterministic Trade Score that explains itself (see "Matches" below).
Users can also publish a limited, read-only, revocable public view of
their progress for a set (V0.1) — see "Collection sharing" below.

For the product vision and full V0 requirements, see [docs/README.md](docs/README.md).
For known risks, see [docs/risks.md](docs/risks.md). For deferred ideas, see
[docs/ideas.md](docs/ideas.md). For decisions already taken, see
[docs/decisions.md](docs/decisions.md).

## Stack

- **Backend:** Node.js + TypeScript + Express + Prisma + SQLite (`server/`)
- **Frontend:** React + Vite + TypeScript (`web/`)
- **Tests:** Vitest + Supertest (`server/tests`)

A modular monolith, not microservices — see
[docs/architecture.md](docs/architecture.md) for the rationale.

## Setup

Requires Node.js 20+.

```bash
npm install                 # installs both workspaces (server, web)
npm run migrate --workspace=server   # create/apply the SQLite schema
npm run seed                # load deterministic demo data
```

`server/.env` is created from `server/.env.example` automatically the first
time you set up the project; review it if you need to change the port or JWT
secret. No secrets are committed to the repo.

## Run

```bash
npm run dev
```

This starts both the API (http://localhost:4000) and the web app
(http://localhost:5173, proxying `/api` to the backend) with one command.

Sign in with any seeded demo user via the "quick sign in" buttons on the
login page (`alice@example.com` / `bob@example.com` / `carol@example.com`,
password `password123`), or register a new account.

## Collection

Home shows only numbers the API computed: owned, missing, extras, copies
offered for trade, sale, or donation, and exchanges that need a response.
Match highlights are limited to sets you have already started. Overall
completion counts every catalogued card, including sets you have not
opened, and the page says so.

Inside a set, filter by owned, missing, duplicates, rarity, availability,
condition, and sample metadata. Sort, switch between grid and list, and
select cards. **Mark owned** adds one Keep copy for each selected card you
do not already own. **Add a copy** always adds another physical copy.
Availability and condition apply to the copies you already have. A copy
reserved for an open exchange cannot be changed. Select one card to edit
it, or two cards to compare them.

## Matches

From a set, Matches ranks every other collector by a **Trade Score**
(0-100) — how much closer a proposed trade or donation gets you (and, for
trades, them) to completing the set. Each match shows the score, whether
it is a trade or a donation, what each person would receive, and the
projected completion change. The score measures collection usefulness
only — it is not a price or fairness estimate; see
[docs/architecture.md](docs/architecture.md#trade-score-formula) for the
formula and [docs/risks.md](docs/risks.md) for the residual risk of it
being misread as one. The home page shows the top few of these for sets
you have started.

## Exchanges

From a match, "Propose this trade" or "Ask for these cards" opens an
exchange. The other collector accepts or declines. Cards stay where they
are until **both** people confirm that the cards have actually changed
hands — then those copies move and are marked `KEEP`. Either person can
cancel until that second confirmation. The app does not send a message,
share an email, or suggest a meeting place.

A copy in an open exchange is reserved: it cannot be edited or deleted,
and other collectors are not offered it. On the card you can also note a
condition (Mint through Poor). That note is your description, not a grade,
and it does not change the match score. The exchange shows the condition
that was set when you proposed.

Open exchanges are listed under Exchanges. Past exchanges, including the
completed sample trade, are on the Past tab.

## Collection sharing

From a set, open "Share this collection" to enable a public
link, choose which fields it shows (completion %, owned, missing,
duplicates, trade offers, give-away offers), copy or open it, and disable
or regenerate it at any time. The public page (`/c/:shareId`) works logged
out and shows only what you opted into — no email, account id, or location
is ever exposed. See
[docs/architecture.md](docs/architecture.md#collection-sharing-v01) for the
design and [docs/risks.md](docs/risks.md) for the residual risk (link
possession is the only access control in V0.1 — no expiry yet).

## Test

```bash
npm test
```

Runs the backend test suite (domain logic + an authorization/IDOR
integration test) against a disposable SQLite test database.

## Lint & format

```bash
npm run lint            # ESLint, both workspaces
npm run format          # Prettier — write mode
npm run format:check    # Prettier — check mode (used in CI)
```

Prettier is configured for a 120-character line width (`.prettierrc.json`);
ESLint defers to it for formatting via `eslint-config-prettier`. CI
(`.github/workflows/ci.yml`) runs format-check, lint, test, and build on
every pull request into `main`.

## Project layout

```text
server/   Express API, Prisma schema + migrations, domain logic, tests
web/      React web client
docs/     Product vision, architecture, API reference, risk register, ideas
```

See [docs/architecture.md](docs/architecture.md) for module boundaries, the
catalog provider abstraction, the matching flow, and how a future mobile
client would consume the same API. See [docs/api.md](docs/api.md) for the
full endpoint reference.
