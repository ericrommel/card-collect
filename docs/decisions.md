# Decisions

Autonomous product decisions, with the reason they were taken. This is not a roadmap.

## 2026-10-08 — Collection explorer

The old set page was one form per card. That does not work once a set has hundreds of cards.

The set page is now a grid, with an optional compact list. Search, filters, and sort run in the browser after one load of the checklist and the caller's copies. People select many cards and mark them owned, add copies, or change availability and condition together. One selected card opens an editor. Two selected cards open a side-by-side comparison. A larger selection stays on the bulk bar, because a sheet over the grid made it easy to lose the selection.

**Mark owned** uses `ensure_one`, so it does not create a second copy of a card the person already has. **Add a copy** always creates one.

## 2026-10-08 — Sample catalogs instead of unofficial real card lists

Official One Piece, Pokémon, and Panini metadata and artwork are not licensed for this app. Inventing real card names would be the same problem.

The seed keeps Starter Voyage, a 24-card synthetic set with the Alice/Bob trade and Bob's donation, and adds Harbor Atlas: three original sets (180, 120, and 96 cards) with invented names. Both universes show a notice that they are not official. Card faces are geometric drawings generated from the number and name. A licensed `CatalogProvider` can replace the seeded rows later. The app does not block on that provider.

## 2026-10-08 — Dashboard uses real rows only

Home is `GET /my/dashboard`. It does not invent activity.

Match highlights run only for sets the person has started, then keep the top three trades and top three donations. Donations on a set they have not started stay on that set's Matches page, so an empty account is not a wall of other people's offers. Overall completion still counts every catalogued card, including those untouched sets, and the page says so.

## 2026-10-08 — One web client

The product surface is the responsive web app. It is not a native Android or iOS application. It can be installed from the browser; that install is still this website, described below. Mobile-only abilities (camera, for example) stay behind a replaceable interface. Bearer tokens remain available for a future non-browser client.

## 2026-10-08 — Installable website

A browser can install Cards Collect from the manifest. The installed icon opens this website. It does not add an Android or iOS application, and it does not keep a copy of the collection on the device.

The service worker does not store `/api` responses. Photos and collection data still come from the network with the session cookie. On activate, the worker deletes any cache an older copy may have left.

## 2026-10-08 — Request guards, not a new auth system

Cookie writes now require an `Origin` from the app. Reads still allow a missing `Origin`, because browsers omit it on some navigations and the cookie is already `SameSite=Lax`. Sign-in requires that origin unless the client is explicitly asking for a bearer token. A cross-site page cannot add that header without a CORS preflight, and the API only reflects the configured app origin.

Sign-in is limited to 20 attempts a minute per socket address. Proposals are limited to 30 a minute per account. `trust proxy` stays off so `X-Forwarded-For` is not a rate-limit key. The API also sends nosniff, no-referrer, frame denial, no-store, and a CSP that allows nothing, because it only returns JSON. The dev server does not use that CSP.

Two proposals for the same match are serialized by the existing exchange transaction: reserving a copy updates only a row that is still free, and a miss rolls the whole proposal back. A test fires both requests together.

The lockfile takes the non-major patches for Express, `qs`, `proxy-addr`, and the dev-only packages `brace-expansion`, `js-yaml`, and `source-map-js`. `shell-quote` is overridden to 1.12.0 because `concurrently` pins an affected release. This repo uses that package only to start local dev processes. Vite, Vitest, and React Router stay on their current majors: the fixes are breaking upgrades, the Vite and Vitest issues are limited to the dev server and the test runner, and the app does not use React Router's server renderer. Those three are not treated as fixed.

Official catalogs, AI condition, and native apps are unchanged. Photos and the manual add flow are described below.

## 2026-10-08 — Private photos, confirmed by the collector

Adding a card does not require a photo. From a set, Add a card searches by name or number and saves one physical copy only after the person presses Add this copy.

A JPEG or PNG can be taken or chosen. The server checks the file type from the bytes, drops JPEG metadata segments and PNG text chunks, and stores the file outside the web root. The owner can see it. A public share does not include it. When a trade or donation is completed, those photos are deleted instead of moving with the card. Two pictures are not treated as proof that they show the same card, or that the person owns it.

No recognition service is configured. The identify route returns that fact and does not create a copy. The route accepts a replaceable provider, and any candidates it returns are labeled as guesses. The copy is still created only by the separate add action.

Each photo is limited to 5 MB. An account can keep 200 photos. HEIC is rejected. The app does not re-encode the picture, so this is a metadata strip and a type check, not a full image sanitizer.

## Not done, on purpose

| Item                                   | State                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official card metadata and artwork     | Blocked until a license exists. Sample catalogs are the stand-in.                                                                                                                                           |
| Automatic card identification          | No recognition provider is configured. The app can accept a photo and will say so, but it will not invent a match. A guess, if a provider is added later, still has to be confirmed before a copy is saved. |
| AI condition estimate                  | Not built. Manual condition remains. An estimate would not be a professional grade, and two photos would not prove they are the same card.                                                                  |
| Guided capture                         | Not built. A photo is optional and private. It is not proof of ownership, and the front and back are not checked to be the same card.                                                                       |
| Content-Security-Policy on the web app | The API sends a strict policy. The dev server does not, so its scripts keep working. A production host for the built web app still needs framing and nosniff.                                               |
| Native apps                            | Not built. A phone can install the website from the browser. That is still the website.                                                                                                                     |
| Share-link social previews             | Not built. A crawler that does not run JavaScript sees the site description, not one collection. The public page is drawn in the browser and marked noindex.                                                |
