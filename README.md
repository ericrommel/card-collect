# Cards Collect

A safety-first collectible-card collection and exchange platform.

Signed-in collectors land on a dashboard of their sets, completion, extras,
matches, and exchanges. Each set opens as a card grid: search, filter, select
many cards, and add or update copies in one action. A list view is available
when a grid is the wrong shape.

Two sample catalogs ship with the seed. **Starter Voyage** is a 24-card
synthetic set. **Harbor Atlas** is an original 396-card catalog (three sets)
for trying a large collection. Neither is an official product, and the card
faces are generated patterns, not publisher artwork. The domain model stays
generic (see [docs/architecture.md](docs/architecture.md) and
[docs/decisions.md](docs/decisions.md)). The web session stays in an httpOnly
cookie. A cookie write is accepted only from the app. Sign-in, proposals,
catalog search, and public set checklists are rate-limited. From a set, Add cards searches the catalog or
attaches a private photo. The app does not identify the card by itself.
Trades and donations show the cards and the condition of the copy that would change hands.

```text
V0         — Collection tracking (owned/missing/duplicates/completion) + matching
V0.1       — Safe, revocable public collection sharing
V0.2       — Smart Trade Score: deterministic, explainable ranking of matches
Exchanges  — Propose, accept, and confirm a trade or donation
Explorer   — Dashboard, visual collection browser, bulk copy changes, large sample catalog
Photos     — Optional private photo on a copy. The app does not identify the card.
Install    — The website can be added to a home screen. It is not a native app.
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

## Account

**Account** in the header shows the email for this login and the display
name other collectors see. The email cannot be changed. The display name
can, and it cannot be an email address or a link, because matches,
exchanges, and a shared collection show it. Changing the password keeps
this browser signed in and signs out the others. Sign out ends every
session for the account. There is no email reset. Password guesses are
limited to 10 a minute.

## Collection

Home shows only numbers the API computed: owned, missing, extras, copies
offered for trade, sale, or donation, and exchanges that need a response.
Sets you have started come first, and the one with more of your cards comes
before a smaller one. On a phone those sets sit under the greeting, before
the count tiles and the search box. Match highlights are limited to sets
you have already started. Overall completion counts every catalogued card,
including sets you have not opened, and the page says so.

Home and the catalog can search the sample catalog by card name, number,
or set. Each result says whether you have that card. You can add a Keep
copy from the result. It has no condition until you set one, and the
counts on that page update. You can also open the set already searched.
A search without a working session does not include that count.

Add, in the navigation, is the step for one card. Search the whole
catalog, choose availability and condition, and attach a photo if you
want. The copy is saved only after you confirm. The photo stays on your
account. Recognition does not pick the card unless a provider is
configured, and a guess still has to be confirmed. Marking many cards at
once stays on the set page.

The numbers on home open the same set covers: missing cards, extras, cards
you have, and copies for trade, sale, or donation. A set you have started
comes first. Opening the cover applies that filter. A link can also search
one card by its number.

Inside a set, filter by owned, missing, extras, rarity, availability,
condition, and sample metadata. The address keeps that list, including the
sort, so a refresh stays on it. On a phone the filter list scrolls on its
own, so the cards stay on screen. The owned, missing, and extras counts on
the set open that list. A card shows its condition when every copy
agrees. Copies that differ say Mixed. A card with no condition note stays
unmarked, and a public page still does not show condition. Sort, switch between grid and list, and
select cards. **Select these** chooses the cards on screen. **Mark owned** adds one Keep copy for each selected card you
do not already own. **Add a copy** always adds another physical copy.
**Offer duplicates** asks first, then keeps one copy of each selected card — the one already
marked Keep, or else the oldest — and marks the other free copies for trade. Cancel leaves the cards as they are.
**All copies** asks first, then changes every free copy, including the one you are keeping. The condition list asks the same way. Cancel leaves the cards as they are.
A copy reserved for an open exchange cannot be changed. On a wide screen,
one selected card opens beside the grid and two selected cards compare
side by side. On a phone, the set title and progress sit closer together, the sample notice is left to home and to a wide screen, and the card face is a little shorter, so the first card's name, number, and ownership stay above the navigation. Add sits on the card, and Share stays on the result line until it is opened. Selecting cards leaves the grid open. The bar stays on one row:
how many are selected, Mark owned, and More for the other actions. The
first selected card scrolls up so it sits above that bar. Use **Details**
or **Compare** on the bar when you want that panel, and closing
it keeps the cards you selected.

## Matches

From a set, Matches ranks every other collector by a **Trade Score**
(0-100) — how much closer a proposed trade or donation gets you (and, for
trades, them) to completing the set. Each match shows the score, whether
it is a trade or a donation, what each person would receive, the condition
of the copy that would change hands, and the projected completion change. Giving away your only copy of a card lowers
that number; a spare copy does not. The score measures collection usefulness
only — it is not a price or fairness estimate; see
[docs/architecture.md](docs/architecture.md#trade-score-formula) for the
formula and [docs/risks.md](docs/risks.md) for the residual risk of it
being misread as one. The home page shows the top few of these for sets
you have started. On a phone, the completion change and the next action
sit above the card faces, and both counts sit above those faces, so
proposing does not require scrolling through every card.

## Exchanges

From a match, "Propose this trade" or "Ask for these cards" opens an
exchange. On a phone, that button and the actions on an open exchange sit
above the card faces, and both counts come before the faces. On a phone those cards are rows, so each name sits
beside its face. An open exchange says how each set would change if it finishes,
using the copies people have now. The other collector accepts or declines. Cards stay where they
are until **both** people confirm that the cards have actually changed
hands — then those copies move and are marked `KEEP`. Either person can
cancel until that second confirmation. The app does not send a message,
share an email, or suggest a meeting place.

A copy in an open exchange is reserved: it cannot be edited or deleted,
and other collectors are not offered it. On the card you can also note a
condition (Mint through Poor). That note is your description, not a grade,
and it does not change the match score. A match shows the condition of the
copy that would be set aside. The exchange keeps the condition that was
set when you proposed.

Open exchanges are listed under Exchanges. Ones that need you come first:
a proposal you received, or an accepted exchange you have not confirmed.
The page says how many are waiting on you and how many are waiting on the
other person. Past exchanges, including the completed sample trade, are
on the Past tab.

## Collection sharing

From a set, open "Share this collection" to enable a public
link, choose which fields it shows (completion %, owned, missing,
extras, trade offers, give-away offers), copy or open it, and disable
or regenerate it at any time. The public page (`/c/:shareId`) works logged
out and shows only what you opted into — no email, account id, location,
photos, or card condition. The page says so. It shows one of those lists at a time and opens on cards
for trade when any are shared. On a phone each card is a row. A copy
already in an open exchange is not shown as available. The link works for 30 days. Renew keeps the same address
and starts another 30 days; regenerate replaces the address and resets
the open count. The owner can see how many times the public page loaded
and when, not who opened it. See
[docs/architecture.md](docs/architecture.md#collection-sharing-v01) for the
design and [docs/risks.md](docs/risks.md) for the residual risk (during
that window, link possession is still the only access control).

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
