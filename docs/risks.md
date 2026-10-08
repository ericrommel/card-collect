# Risk Register

This document is intentionally living documentation. Risks should not block implementation unless they affect a current architectural or safety-critical decision.

Status values:

```text
OPEN
INVESTIGATING
MITIGATED
ACCEPTED
RESOLVED
```

Priority values:

```text
P0 - Safety/security critical
P1 - High business or architectural impact
P2 - Important but deferrable
P3 - Low-impact or future concern
```

## P0 — Child and User Safety

**Status:** OPEN

Assume that children and teenagers may be a significant part of the user base.

Key risks include:

- exposing precise user location;
- adult-to-minor direct contact;
- grooming or coercive behavior;
- scams targeting minors;
- unsafe in-person meeting arrangements;
- oversharing personal information;
- public profile exposure;
- harassment or bullying;
- external-contact solicitation;
- sharing addresses or phone numbers;
- inappropriate user-generated content.

### Initial Mitigations

- do not expose precise location;
- avoid public personal information by default;
- do not implement unrestricted chat in V0;
- keep matching possible without revealing contact details;
- design account age/guardian concepts so they can be introduced cleanly later;
- use privacy-safe defaults for shared collection pages;
- design reporting, blocking, and moderation hooks before social features launch.

### Future Investigation

- age assurance;
- parental consent;
- guardian-linked accounts;
- adult/minor interaction policies;
- safe meeting design;
- child-safety regulations in the EU, UK, US, Japan, and other target regions.

---

## P0 — Application Security

**Status:** OPEN

Security must be treated as part of the architecture rather than a pre-launch patch.

Areas to cover:

- authentication and session security;
- authorization for all user-owned objects;
- protection against IDOR/BOLA;
- secure image uploads;
- rate limiting;
- abuse prevention;
- secrets management;
- API authentication;
- encryption in transit and at rest where appropriate;
- audit logging;
- dependency vulnerability management;
- secure password handling;
- account recovery;
- token expiry and revocation;
- input validation;
- file type/content validation;
- OWASP API Security Top 10;
- OWASP ASVS / MASVS as appropriate.

### Initial Mitigations

- enforce ownership authorization server-side;
- keep the web session in an httpOnly cookie, and reject cookie writes that do not come from the app origin;
- limit sign-in attempts, password changes, and exchange proposals in the API process;
- end every session for an account when that person signs out or changes the password. Older cookies and bearer tokens stop working. There is still no email reset and no way to revoke a single other device on its own;
- send nosniff, no-referrer, frame denial, and no-store on API responses;
- do not trust `X-Forwarded-For` for those limits;
- patch non-major dependency advisories in the lockfile. Vite, Vitest, and React Router still need major upgrades, so those advisories stay open. `trust proxy` stays off, which keeps the proxy-addr spoofing bug from choosing a rate-limit key even on an unpatched release;
- use established authentication libraries/providers;
- no secrets in source control;
- private card photos are size-limited, restricted to JPEG and PNG by their bytes, stripped of metadata segments, and visible only to the owner;
- add automated dependency/security checks to CI;
- keep public APIs minimal.

---

## P1 — Catalog Data Licensing

**Status:** OPEN

The platform depends on set/card metadata from external or internally maintained catalogs.

Risks:

- external APIs may prohibit commercial use;
- metadata ownership or database rights may apply;
- providers may change licenses or disappear;
- terms may differ by collectible brand.

### Mitigation

Use a provider abstraction such as `CatalogProvider` and avoid coupling the domain model to one external API.

The running app does not call an external catalog. It seeds original sample metadata (Starter Voyage and Harbor Atlas) and labels both as not official. Real publisher lists stay out until a license exists. See [decisions.md](decisions.md).

Investigate licensing before commercial production use. Do not block local use on that license.

---

## P1 — Official Card Image Rights

**Status:** OPEN

Official card/sticker artwork is likely protected by copyright and brand licensing.

Risks:

- copying images from Bandai, Panini, Pokémon, marketplaces, or community APIs may not be commercially permitted;
- downstream APIs may expose images without granting redistribution rights.

### Initial Mitigation

The core application must work without official catalog images. The web client draws a geometric face from the card's number and name. That drawing is not artwork from a publisher.

Support separate image sources:

```text
LicensedProvider
UserPhoto
OfficialRemoteReference
None
```

Do not make official artwork a hard dependency of the domain model.

---

## P1 — External API Commercial Use

**Status:** OPEN

Before production, validate commercial terms for each provider used for:

- catalogs;
- card identification;
- condition assessment;
- pricing;
- images.

Development and commercial providers may differ.

---

## P1 — Minor Privacy / GDPR

**Status:** OPEN

Location, user photos, profiles, behavioral data, and social connections may trigger significant privacy obligations, especially for minors.

Investigate before enabling location-aware matching or public/social functionality.

---

## P1 — Marketplace Regulation

**Status:** ACCEPTED FOR LATER

Selling introduces substantially greater regulatory scope:

- payment processing;
- KYC/AML depending on design;
- marketplace reporting;
- taxation;
- consumer protection;
- disputes;
- chargebacks;
- seller obligations.

### Mitigation

Do not implement integrated transactions in V0.

---

## P1 — High-Value Trade Safety

**Status:** ACCEPTED FOR LATER

Some collectible cards can be worth hundreds or thousands of euros.

Potential risks:

- theft during meetings;
- fraudulent condition claims;
- counterfeit cards;
- coercion;
- package fraud;
- false ownership.

Trade safety will require stronger verification and reputation mechanisms before supporting high-value transactions.

---

## P2 — Catalog Completeness and Variant Accuracy

**Status:** OPEN

Sets may contain:

- base cards;
- alternate art;
- parallel versions;
- secret rares;
- promotional cards;
- reprints;
- region-specific releases;
- language variants.

The data model must allow variants without assuming one canonical physical appearance per card number.

---

## P2 — Card Identification Accuracy

**Status:** ACCEPTED FOR LATER

Camera identification may confuse:

- alternate arts;
- foils;
- reprints;
- language variants;
- similar card layouts;
- poor lighting or blur.

Manual correction must always be possible.

---

## P2 — AI Condition Assessment Accuracy

**Status:** ACCEPTED FOR LATER

AI assessment is sensitive to:

- lighting;
- sleeves;
- camera quality;
- glare;
- focus;
- background;
- hidden defects;
- surface reflections.

The product should describe automated results as an estimate, not professional grading.

---

## P2 — AI Cost at Scale

**Status:** ACCEPTED FOR LATER

Per-image grading or identification APIs may become expensive as scanning volume grows.

Potential mitigations:

- cache results;
- perform identification locally where feasible;
- separate quick scan from detailed assessment;
- allow provider replacement;
- eventually train specialized internal models.

---

## P2 — Pricing Data Reliability

**Status:** ACCEPTED FOR LATER

Market prices vary by:

- language;
- region;
- condition;
- variant;
- seller;
- raw vs graded status;
- liquidity.

Price should be presented as an estimate, not guaranteed value.

---

## P2 — External Provider Availability

**Status:** OPEN

External catalog, pricing, or AI providers may disappear, rate-limit the application, or change pricing.

### Mitigation

Introduce provider interfaces and persist normalized internal identifiers/data where legally appropriate.

---

## P2 — Fake Photos and Ownership Claims

**Status:** ACCEPTED FOR LATER

A user can upload a photograph of a card they do not own.

This is not an MVP blocker because the first product does not guarantee ownership authenticity.

Future options may include:

- guided capture;
- video capture;
- liveness-style capture;
- visual fingerprinting;
- seller verification;
- provenance records.

---

## P2 — Front/Back Image Mismatch

**Status:** ACCEPTED FOR LATER

Front and back images could belong to different physical cards.

Do not claim that two uploaded images prove identity of one physical card.

Front/back should initially be treated only as evidence for condition estimation.

---

## P2 — Reputation and Abuse

**Status:** ACCEPTED FOR LATER

Any social exchange network can develop:

- fake accounts;
- repeated no-shows;
- deceptive offers;
- spam;
- review manipulation;
- harassment.

Design user and trade entities so reputation/moderation data can be added later.

---

## P2 — Shipping and Disputes

**Status:** ACCEPTED FOR LATER

Shipping introduces tracking, lost packages, condition disputes, address exposure, and fraud.

Keep shipping outside V0.

---

## P2 — Social Sharing Privacy

**Status:** ACCEPTED FOR LATER

Public collection URLs may reveal interests, value, usernames, location, or inventory.

Public pages should be opt-in and allow fine-grained visibility controls.

---

## P2 — Multi-Platform Architecture

**Status:** OPEN

The product must support web, Android, and iOS without duplicating core business logic.

Architectural decisions should preserve:

- one backend/domain model;
- stable APIs;
- mobile camera integration;
- rich desktop collection management;
- shared validation/business rules where practical.

---

## P2 — Client-Side Token Storage (Web)

**Status:** MITIGATED

The web client used to store its JWT in `localStorage`, which any script
on the page could read and exfiltrate. Login and register now set an
httpOnly SameSite=Lax cookie and the web response does not include the
token. A future mobile client can still ask for a bearer token with
`X-Auth-Mode: bearer` and store it in platform secure storage.

### What this does not fix

An XSS bug can still call the API as the signed-in user while the page is
open, because the browser will attach the cookie. It cannot lift the token
out and reuse it elsewhere. There is still no Content-Security-Policy.
Do not render user-supplied HTML. Exchange text is structured data (card
names from the catalog, a fixed condition list), not free-form messages.

---

## P2 — Matching Engine Scalability

**Status:** OPEN

`computeMatchesForUser` (see `server/src/modules/matching/service.ts`)
computes a match against _every other user in the system_ on each request,
each requiring its own set of database queries. This is intentional for
V0 — it is simple, correct, and fast enough for a handful of demo users —
but it is O(n) in total user count per request and will not scale as the
user base grows.

### Mitigation direction

Before this becomes a real bottleneck: precompute/cache each user's
missing-collectible set and offerable-copy set (invalidated on copy
mutation) instead of recomputing per match request, and/or restrict the
candidate pool (e.g. to users who share at least one set) before running
the full match computation. Do not attempt this optimization until there
is evidence it is needed — premature for V0's scale.

---

## P2 — Public Share Links Have No Access Log (V0.1)

**Status:** OPEN

A public link works for 30 days after the owner turns it on, renews it,
or regenerates it. Anyone who has the link during that window can read
the fields the owner left visible. There is still no per-viewer
authentication and no record of who viewed the share.

That means:

- a link forwarded outside the intended audience keeps working until it
  expires, or until the owner disables or regenerates it;
- there's no way for the owner to see whether a link has been viewed, so
  a leak during the window may go unnoticed;
- for a minor's account, an unlogged link is still a sharper version of
  the general "oversharing personal information" risk in the P0 Child
  Safety register above, even though the shared fields themselves
  (owned/missing/duplicate/trade/give-away card lists, completion %) are
  not personal contact information.

### Mitigations already in place

- the link stops working after 30 days. Renewing keeps the same address
  and starts another 30 days from that moment. Regenerating invalidates
  the old address immediately and starts a new window. Disabling clears
  the end time. An expired link is the same 404 as one that never existed;
- shared fields are strictly limited to non-identifying collection data —
  no email, no internal id, no location, no age (see
  [architecture.md](architecture.md#collection-sharing-v01));
- the HTML shell is `noindex, nofollow`, including for a crawler that does
  not run JavaScript, and the public page sets the same tag after it renders.

### Future investigation

- a lightweight access log visible to the owner ("last viewed 2 days ago")
  without identifying the viewer;
- guardian-mediated sharing controls for accounts flagged as minors, once
  age/guardian concepts exist (see the P0 Child Safety entry above).

---

## P2 — Trade Score Could Be Misread as a Fairness/Value Guarantee (V0.2)

**Status:** OPEN

The Trade Score (`domain/tradeScore.ts`) ranks matches by set-completion
usefulness only — it has no concept of card rarity value, market price,
or condition. A user (especially a younger one, or one new to the
hobby) could reasonably but incorrectly read a prominent "94% Match"
badge as "this trade is fair" or "these cards are worth about the same,"
when the score says nothing about value at all: a common card and a
rare secret card each "count as 1 missing card" identically.

This is explicitly flagged in the implementation
([architecture.md](architecture.md#trade-score-formula): "a
collection-usefulness index, not a measure of objective market or
financial trade fairness"), but a doc comment doesn't stop a UI label
from being over-trusted by an end user who never reads the docs.

### Initial mitigations already in place

- the web UI labels it "Match" / "Donation Match," not "Fair Trade" or
  "Value Match", and the Matches page and each open exchange say the
  score is about finishing the set, not card value or a fair price;
- user-entered condition is shown on an exchange and is explicitly not an
  input to the score;
- no price/value data exists anywhere in the app (see the existing
  Pricing Data Reliability and AI Cost risks above) — there is currently
  no data source the score could draw a value signal from.

### Future investigation

- if a short explanatory label or tooltip ("based on what completes
  your set, not card value") is warranted once real users see the
  feature;
- revisit if/when any price-intelligence feature (see `ideas.md` I9) is
  ever built — at that point the naming and framing need explicit
  re-review so a usefulness score and a value/fairness score are _never_
  visually conflated.

---

## P1 — Exchange Completion Is an Honor System

**Status:** OPEN

Exchanges let two collectors agree on specific copies and, after both
confirm, move those copies in the database. That confirmation is a
statement by each user. The app has no shipment, escrow, photo of the
handover, or other evidence the physical cards changed hands. A person
can confirm a trade that did not happen, or be pressured off-platform to
confirm one.

This matters more because some users may be children. The exchange is a
real interaction between two accounts, even though it does not add a
contact channel.

### Initial mitigations already in place

- no free-text message, email, location, or meeting suggestion is part of
  an exchange. The UI says the app does not message the other collector
  or arrange a meeting;
- either participant can cancel until both have confirmed, so a deal is
  not trapped. There is no penalty score that could be used to pressure
  someone into confirming;
- copies are reserved for that one exchange, so the same card cannot be
  promised twice, and availability/condition cannot be quietly changed
  underneath the agreement;
- ownership changes only on the second confirmation, and received copies
  reset to `KEEP`;
- responses use an opaque collector ref, never an email or account id.
  Someone who is not a participant gets the same 404 as a missing id;
- the Trade Score is labeled as set-completion usefulness, not fairness
  or price.

### Not a safety guarantee

None of the above makes an in-person meeting safe. The app does not know
whether the two people should meet, and it does not claim to.

### Future investigation

Before any in-app contact, meetup suggestion, or shipping address:
reporting, blocking, and an age/guardian model (see the P0 Child Safety
entry). Do not add those contact features first.

---

## P3 — New Collectible Expansion

**Status:** ACCEPTED

The initial implementation should support One Piece while avoiding domain assumptions that prevent later support for:

- Pokémon;
- Panini/FIFA albums;
- Magic: The Gathering;
- Yu-Gi-Oh!;
- Lorcana;
- sports cards;
- other collectible types.
