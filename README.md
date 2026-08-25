# Cards Collect — V0

A safety-first collectible-card collection and exchange platform. This is the
first vertical slice: users track a collection, see what they own/miss/have
duplicated, mark physical copies with an availability state, and get matched
with other collectors for mutually useful trades or one-way donations. Users
can also publish a limited, read-only, revocable public view of their
progress for a set (V0.1) — see "Collection sharing" below.

The first supported catalog is a synthetic One Piece Card Game set, but the
domain model is generic (see [docs/architecture.md](docs/architecture.md)).

For the product vision and full V0 requirements, see [docs/README.md](docs/README.md).
For known risks, see [docs/risks.md](docs/risks.md). For deferred ideas, see
[docs/ideas.md](docs/ideas.md).

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

## Collection sharing

From a set's checklist page, use the "Sharing" panel to enable a public
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
