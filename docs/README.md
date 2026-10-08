# Collectible Card Exchange Platform

## Where the product is

Implemented: accounts and httpOnly sessions (cookie writes require the app origin; sign-in, password changes, and proposals are rate-limited; signing out or changing the password ends every session for that account), a collection dashboard, a visual set explorer with bulk edits, an add-a-card flow with optional private photos, manual condition, Trade Score matches, trades and donations with reservation and dual confirmation, and revocable public sharing that expires after 30 days. The owner can see how many times a public link was opened, not who opened it. Home and the catalog can search the sample catalog by name, number, or set. A signed-in result says how many copies you have and can add a Keep copy; a search without a working session does not include that count. Add in the navigation confirms availability, condition, and an optional private photo before saving one copy. In a set, a card shows its condition when every copy agrees, and Mixed when they do not. Public pages still omit condition. On a phone, the selection bar stays on one row until More is opened, one selected card scrolls above that bar, and the first card's name stays above the navigation. Home leads with the sets already started, ahead of the count tiles and the search box. On a phone, a match or an open exchange shows the completion change and the next action before the card faces, and both counts before those faces. A public link shows one shared list at a time, starting with cards for trade when there are any, and leaves out a copy that is already in an open exchange. On a phone that list is rows. Open exchanges that need you are listed first. A display name cannot be an email address or a link. Rarity, condition, detail, and sort in a set stay in the address. The lists behind the home counts use the same set covers, and opening a cover applies that filter. On a phone the filter list scrolls on its own, so the cards stay on screen. A match shows the condition of the copy that would change hands. Select these chooses the cards on screen, and Mark owned is still a separate step. On a phone the set page leaves the sample notice to home and uses a slightly shorter card, so the first card stays above the navigation. Catalog search and a public set checklist each allow 120 requests a minute per network address, and they do not share that budget. On a phone, a search result moves up so the card and its add button stay above the navigation. The set code is the only text that sits beside a title there, so the Add a card instructions stay a paragraph. Focusing an account field moves it above the navigation too. On a set, search stays on screen while the cards scroll. A card with a front photo shows that photo in your own set; a public page still uses the sample drawing. On the grid, Add sits on the corner of a missing card so a row stays one height. On a phone, an exchange lists the cards you would receive before the cards you would give. In your set, a place, person, object, or event uses one mark, and the kind is written under the name. A search result, a match, an exchange, and a public page use that same mark when the catalog names a kind. Home shows that same mark on cards you added recently and on the short exchange list. Each set on home and in the catalog shows one card from that set. On a match, the completion change sits beside whose collection it is. When you add a card, a photo of the back is optional and stays on your account.

Sample data only: Starter Voyage (synthetic, 24 cards) and Harbor Atlas (original, 396 cards). These are not official sets. Card faces are generated patterns. A trade's completion change keeps a spare copy and drops a card when the only copy would leave.

Not implemented: licensed publisher catalogs, automatic card identification, AI condition estimates, native Android or iOS apps, payments, chat, and precise location. The website can be installed from a browser; that is not a native app. A photo can be attached, but recognition is unavailable until a provider is configured. See [decisions.md](decisions.md).

## Product Vision

Build a safety-first platform for people to manage, complete, exchange, donate, and eventually sell collectible cards across web, Android, and iOS.

The core product idea is not simply a marketplace. It is a **smart collection network** that helps users understand what they own, what they are missing, what they have duplicated, and which other collectors are the best match for a fair exchange.

The platform should initially focus on collectible card games such as **One Piece Card Game**, while keeping the domain model generic enough to support other collections later, including Pokémon, Panini/FIFA sticker albums, Magic: The Gathering, Lorcana, and similar products.

## Core Product Principles

1. **Safety by Design** — assume that a meaningful portion of the user base may be children or teenagers. User safety, privacy, abuse prevention, and secure defaults are first-class product requirements.
2. **Collection First** — the initial value proposition is managing and completing a collection, not buying and selling.
3. **Exchange Intelligence** — the product should actively identify mutually beneficial exchanges instead of forcing users to search card by card.
4. **Provider Agnostic** — card catalogs, prices, images, and AI services must be abstracted behind provider interfaces so external dependencies can be replaced.
5. **Web + Mobile from One Domain** — web is optimized for collection management; mobile is optimized for capture, scanning, and fast actions. Both use the same backend and data model.
6. **Progressive Capability** — start with collection and matching. Scanning, AI condition assessment, location, social features, marketplace capabilities, and provenance can be added incrementally.

## Initial User Journey

A user should be able to:

1. Create an account.
2. Select a collectible universe and set, initially One Piece.
3. Add cards to their collection manually.
4. Track owned quantities, missing cards, duplicates, and completion percentage.
5. Mark individual copies as `KEEP`, `TRADE`, `SELL`, or `GIVE_AWAY`.
6. Discover another collector with mutually useful cards.
7. View a proposed exchange or donation opportunity.

The first release does **not** need payments, shipping, public chat, precise geolocation, professional grading, blockchain, or fraud-proof ownership verification.

## Domain Model Direction

The core domain should avoid assumptions that are specific to one card game.

Suggested hierarchy:

```text
CollectibleUniverse
  -> CollectionSeries
      -> Set
          -> Collectible
              -> Variant
                  -> UserCopy
```

Example:

```text
One Piece Card Game
  -> Main Sets
      -> OP-05 Awakening of the New Era
          -> OP05-119 Monkey D. Luffy
              -> Manga Rare
                  -> UserCopy #1
```

A `UserCopy` represents one physical copy owned by a user. This matters because multiple copies of the same collectible may have different conditions or availability states.

Possible fields include:

```text
owner
collectible_variant
condition
availability
front_image
back_image
created_at
updated_at
```

## Availability States

A physical copy may be:

```text
KEEP
TRADE
SELL
GIVE_AWAY
```

These states should be extensible and should not imply that marketplace functionality already exists.

## Matching Direction

The matching engine should eventually consider:

- cards user A is missing;
- duplicates or available cards owned by user B;
- cards user B is missing;
- available cards owned by user A;
- estimated market value;
- card condition;
- collection completion impact;
- geographic proximity;
- user reputation and trade preferences.

For the first MVP, matching can use only:

```text
my missing cards
+
my available duplicates
+
other user's missing cards
+
other user's available duplicates
```

A useful mental model is:

> I have cards you need, and you have cards I need.

## Web and Mobile Responsibilities

### Mobile

Optimized for:

- camera capture;
- card scanning;
- quick add/remove actions;
- condition capture;
- reviewing matches;
- future notifications and trade actions.

### Web

Optimized for:

- browsing complete sets;
- filtering large collections;
- viewing missing and duplicated cards;
- bulk editing;
- comparing collections;
- reviewing exchange proposals;
- sharing collection pages.

Both clients must use the same backend domain and APIs.

## Social and Sharing Direction

Future sharing capabilities may include:

- public or private collection pages;
- shareable missing-card lists;
- shareable duplicate lists;
- shareable completion milestones;
- social-media-friendly preview cards;
- donation listings;
- trade wishlists.

All sharing must follow privacy-safe defaults, particularly for minor accounts.

## MVP Scope

### Include

- authentication foundation;
- users;
- collectible catalog abstraction;
- One Piece sample catalog/provider;
- sets and collectible variants;
- collection management;
- quantities / physical copies;
- missing and duplicate calculations;
- completion percentage;
- availability state;
- basic user-to-user matching;
- API usable from both web and mobile clients;
- minimal web UI;
- minimal mobile-capable architecture.

### Explicitly Exclude for V0

- payments;
- integrated shipping;
- KYC;
- public marketplace checkout;
- unrestricted user chat;
- precise location sharing;
- professional grading predictions;
- blockchain/NFT functionality;
- fraud-proof card ownership verification;
- advanced reputation systems.

## Delivery Sequence

Actual milestone history (see `docs/architecture.md` for what each one
built):

```text
V0         Collection + duplicates + missing + matching
V0.1       Safe, revocable public collection sharing
V0.2       Smart Trade Score — deterministic, explainable match ranking
Exchanges  Propose, accept, and confirm a trade or donation
```

User-entered condition (Mint, Near Mint, Excellent, Good, Played, Poor)
is recorded on a physical copy and shown on an exchange. It is not a
professional grade and it does not feed the Trade Score. AI condition
assessment is still future work.

The sequence below was the _original, pre-implementation_ proposal for
what would come after V0. It turned out safe sharing (V0.1) and match
ranking (V0.2) were higher-value next steps than camera identification —
kept here as historical context, not a live commitment:

```text
V0.x  Camera identification
V0.x  AI condition assessment
V0.x  Safe location-aware matching
V0.x  Reputation, moderated communication, trade workflow
V1    Real-world trade support
Later Marketplace / provenance / advanced verification
```

## Success Criterion for the First Vertical Slice

A working demo should allow two users to maintain collections and automatically discover a mutually useful exchange based on missing cards and available duplicates. The seeded demo does this on Starter Voyage, and also on the larger Harbor Atlas sets. The cards are synthetic. They are not an official One Piece set.
