# Cards Collect — V0

A safety-first collectible-card collection and exchange platform. This is the
first vertical slice: users track a collection, see what they own/miss/have
duplicated, mark physical copies with an availability state, and get matched
with other collectors for mutually useful trades or one-way donations.

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

## Test

```bash
npm test
```

Runs the backend test suite (domain logic + an authorization/IDOR
integration test) against a disposable SQLite test database.

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
