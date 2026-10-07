# Collectible Card Exchange Platform

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
V0    Collection + duplicates + missing + matching
V0.1  Safe, revocable public collection sharing
V0.2  Smart Trade Score — deterministic, explainable match ranking
```

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

A working demo should allow two users to maintain One Piece collections and automatically discover a mutually useful exchange based on missing cards and available duplicates.
