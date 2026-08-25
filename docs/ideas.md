# Ideas and Research Tracks

This document contains potentially valuable ideas that are intentionally **outside the initial MVP**.

Ideas belong here so they can be preserved without expanding current implementation scope.

## I1 — Physical Card Digital Identity / NFT / Blockchain

Investigate whether a physical collectible could have a persistent digital identity and provenance record.

Possible capabilities:

- unique digital identity for a physical card;
- ownership history;
- condition history;
- grading history;
- transaction or exchange history;
- provenance verification;
- linkage between physical card and digital record;
- transfer of digital ownership when the physical item changes hands.

Blockchain or NFTs are possible implementation technologies, but they should not be assumed to be the solution.

The research should compare blockchain against conventional signed registries/databases in terms of:

- trust model;
- fraud resistance;
- operating cost;
- privacy;
- reversibility;
- lost credentials;
- regulatory implications;
- user experience;
- environmental/operational cost;
- interoperability.

Important open question:

> How can the system prove that a digital identity still corresponds to one specific physical card rather than a photograph or duplicate record?

Possible future techniques:

- card visual fingerprinting;
- microscopic print-pattern analysis;
- guided multi-angle capture;
- secure third-party grading integration;
- NFC/RFID tags for specialized cases;
- tamper-evident holders;
- certified physical registration.

Also investigate regulatory developments in Japan and other major trading-card markets concerning high-value collectible cards, provenance, fraud, anti-money-laundering controls, and registration concepts.

---

## I2 — AI Condition Assessment

Use front and optionally back images to estimate visible physical condition.

Potential outputs:

```text
Overall condition
Corners
Edges
Surface
Centering
Creases
Scratches
Stains
Whitening
```

Prefer consumer-friendly categories initially:

```text
Mint
Near Mint
Excellent
Good
Played
Poor
```

The product must clearly state that this is an automated estimate rather than professional grading.

---

## I3 — Guided / Verified Capture

Introduce a stronger capture flow for valuable cards.

Potential features:

- require front and back in one guided session;
- ask user to tilt the card;
- detect scene continuity;
- record a short video;
- require a generated challenge pattern or code in-frame;
- derive a visual fingerprint.

This could eventually support stronger ownership and authenticity claims.

---

## I4 — Smart Trade Score

Rank possible exchanges rather than merely identifying compatible collectors.

Possible inputs:

- missing-card overlap;
- duplicates;
- completion impact;
- estimated value;
- condition;
- geographic distance;
- shipping preference;
- user reputation;
- number of cards exchanged;
- rarity;
- user priorities.

Example:

```text
Trade Match: 94%
Collection impact: +5%
Estimated value fairness: 97%
Distance: 3.2 km
```

---

## I5 — Donation Network

Allow users to give duplicates away instead of selling or trading them.

Possible use cases:

- parents giving common duplicates to children completing albums;
- clubs and schools;
- local collecting events;
- charity/community drives;
- automatic "free duplicates" preference.

Example availability state:

```text
GIVE_AWAY
```

---

## I6 — Safe Local Matching

Help collectors find nearby compatible users without exposing exact location.

Potential approaches:

- city-level matching;
- coarse distance buckets;
- approximate radius;
- predefined safe swap points;
- event-based matching;
- guardian-mediated matching for minors.

Exact home coordinates should never be part of the normal discovery experience.

---

## I7 — Collection Sharing

Generate user-controlled pages/cards for sharing:

- collection progress;
- missing cards;
- duplicates;
- trade availability;
- donation availability;
- milestones;
- selected showcase cards.

Support social preview images for WhatsApp, Instagram, X, Discord, and similar platforms.

Privacy controls must precede public exposure.

---

## I8 — Marketplace

Potential future buying/selling capabilities.

Do not implement until payment, fraud, regulatory, tax, KYC, dispute, child-safety, and marketplace obligations have been investigated.

---

## I9 — Price Intelligence

Track estimated market value and historical changes.

Possible capabilities:

- raw card value;
- graded value;
- region-specific pricing;
- language-specific pricing;
- condition-aware estimates;
- price history;
- portfolio value.

Avoid turning the product identity into investment speculation, especially for minor users.

---

## I10 — Events and Swap Points

Allow communities, stores, clubs, conventions, or parents to create controlled card exchange events.

This may provide a safer alternative to direct stranger-to-stranger meetups.
