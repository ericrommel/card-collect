# Decisions

Autonomous product decisions, with the reason they were taken. This is not a roadmap.

## 2026-10-08 — Collection explorer

The old set page was one form per card. That does not work once a set has hundreds of cards.

The set page is now a grid, with an optional compact list. Search, filters, and sort run in the browser after one load of the checklist and the caller's copies. People select many cards and mark them owned, add copies, or change availability and condition together. On a wide screen, one selected card opens an editor and two open a side-by-side comparison. A larger selection stays on the bulk bar, because a sheet over the grid made it easy to lose the selection. A phone does the same for one and two cards — see the later decision.

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

Each photo is limited to 5 MB. An account can keep 200 photos. HEIC is rejected. Bytes after the JPEG end marker are dropped. The app does not re-encode the picture, so this is still a metadata strip and a type check, not a full image sanitizer.

## 2026-10-08 — Share links expire

A public link works for 30 days from the moment sharing is turned on. Renewing keeps the same address and starts another 30 days from today. Regenerating throws the old address away and, if sharing is still on, starts a new window. Turning sharing off clears the end time.

An expired link is the same 404 as a link that never existed. The public response does not say that the collection exists. There is still no record of who opened the link.

## 2026-10-08 — Offer duplicates keeps one copy

Selecting cards and setting availability used to change every free copy, including the copy that makes the card owned. A collector who wanted to trade extras could accidentally offer the copy they meant to keep.

**Offer duplicates** keeps one free copy of each selected card. It prefers a copy already marked Keep, and otherwise the oldest free copy. The other free copies are marked for trade. A card with only one free copy is left alone. **All copies** still changes every free copy when that is what the person wants. Copies reserved for an exchange are not changed.

## 2026-10-08 — Password change and sign-out end every session

The session is a signed token. The server does not keep a separate row for each browser.

The token carries a session version stored on the account. Sign-out increments it and clears this browser's cookie, so every older token stops working, including a copy on another browser. Password change increments it and sets a new cookie on the browser that proved the current password. A wrong current password does not end the session. Guessing is limited to 10 tries a minute for that account.

The account page can also change the display name other collectors see. That does not end the session, and it does not change the email. There is no reset-by-email flow, because the app does not send mail.

## 2026-10-08 — Public opens are a count, not a visitor list

The owner of a shared collection can see how many times the public page loaded and when it last did. The page stores those two fields on the share row. It does not store an address, an account, or a browser.

A disabled, expired, or unknown link is not counted. Regenerating the address starts the count over, because the old address is no longer the one being watched. Renewing and turning sharing off keep the count. Opening the page yourself counts. A second load of the same link within one second counts once, so a double load does not look like two people. More than 60 loads of one link in a minute are not all written down; the page still loads.

The public response does not include the count.

## 2026-10-08 — Phone selection does not cover the grid

On a wide screen, one selected card still opens beside the grid and two still compare there. On a phone, that same panel is a sheet over the set. Opening it for the first tap meant a person could not select a second card, and closing the sheet threw away the selection.

While select mode is on and the layout is narrow, the sheet stays closed until the person chooses **Card details** (one card) or **Compare** (two). Closing that sheet, or pressing Escape, returns to the selection. Escape with the sheet already closed still leaves select mode. A card opened by an ordinary tap, outside select mode, still uses the sheet.

## 2026-10-08 — Home counts open the cards they describe

The owned, missing, extra, trade, donation, and sale counts on home were numbers with nowhere to go. Each one now opens the sets that have those cards, with sets already in progress listed before untouched ones. Opening a set applies that filter, and the address keeps it, so a refresh stays on the same list. Show all cards clears it. Recently added cards open their set already searched by number.

Sale is still only a label. The page says the app does not take payment.

## 2026-10-08 — Catalog search stays inside the provider

Home and the catalog page search card names, numbers, and set names. The local provider loads the sample rows and ranks them in process. A licensed provider can replace that method without a second search API. Fewer than two characters returns nothing, and a broad query stops at 24 cards. Opening a result lands in the set. A later change adds the caller's own copy count when they are signed in.

## 2026-10-08 — Signed-in search shows your copies

Catalog search stays a public read. A working session adds `owned_quantity` for that person only: how many physical copies they have, including zero. A missing or rejected session leaves the field out and still returns the cards. Someone else's copies are not included. Each result also names the default printing, so a signed-in person can add a Keep copy from the result. That copy starts with no condition.

## 2026-10-08 — Completion after a trade is net

A match used to add every card someone would receive and ignore a card they would give away. Trading away your only copy then looked like the set grew. The score and an open exchange now keep a spare and drop a card when none would remain. A declined, cancelled, or completed exchange leaves that projection empty instead of inventing the earlier percentages.

## 2026-10-08 — Add a card is its own step

Home search can save a Keep copy immediately. The Add page is the slower path: search the whole catalog, choose availability and condition, attach an optional photo, then confirm. A phone reaches it from the bottom navigation, and the installed site can offer the same shortcut. Recognition still does not choose the card. The set page remains the place to mark many cards at once.

## 2026-10-08 — Condition shows on the card when the copies agree

The set grid and list show a condition only when every physical copy of that card has the same note. If the copies differ, including one note and one blank, the card says Mixed. Unset copies stay unmarked, so a large set does not fill with "Not set". Public collection pages still omit condition.

## 2026-10-08 — The phone selection bar stays short

Selecting cards on a phone used to pin every bulk action to the bottom, and that stack covered the grid. The phone bar now shows the count, Mark owned, and More. The other actions open from More in two columns, on a solid bar that cannot grow over about half the screen. The first time that bar appears, one selected card scrolls up so it is fully above the bar. Choosing another card does not jump the page again. A wide screen still shows every action at once. Details and Compare stay on that same row when one or two cards are selected.

On a phone, the set title, progress, and filters were tall enough that the first card's name started under the bottom navigation. Those blocks sit closer together. Share stays on the result line until it is opened, and Add sits on the card art instead of under the name. The card's name, number, and ownership stay above the navigation. A wide screen keeps Add under the card, the roomier spacing, and Share as a full-width control above the card count.

## 2026-10-08 — Home leads with the sets you have started

On a phone, home showed the search box and every count before any set, so the collections started under the navigation. Home now puts the sets under the greeting. A set you have started comes before one you have not, and the one with more owned cards comes first. On a phone each set is a row, and its shortcuts wrap instead of being cut off. A wide screen keeps the larger covers and the same order. Search and the counts stay on the page. The dashboard API list is still in release order.

## 2026-10-08 — The next exchange action stays above the cards on a phone

A match or an open exchange listed every card before the button that moves it forward. On a phone that button was below the fold. The completion change and the next action now come first. The cards follow. A wide screen keeps the cards beside the summary, with the action after them.

## 2026-10-08 — A shared collection opens on the offers

A public link stacked every owned card above the trade and donation lists. On a large set, the useful part of the link was under a long catalog. The page now shows one list at a time. Offers come before missing cards, and the owned catalog is last. It opens on the first of those lists that has cards. Search stays in the list on screen and says when another list has the name. On a phone each card is a row, so its name stays above the navigation. A wide screen keeps the card grid.

A copy already reserved for an open exchange stays in the owned count, and it is left out of the public trade and donation lists. Another free copy of the same card is still listed. The page does not say that a copy is reserved.

## 2026-10-08 — Open exchanges that need you come first

The exchanges page listed everything by the last update, so a proposal you received could sit under one you are only waiting on. Open exchanges that need you now come first. The page says how many need you and how many are waiting on the other person. That is the same split as the home count. The API list is unchanged. On a phone, the cards in that list are rows, so each name sits beside its face and stays above the navigation. A wide screen keeps the card grid.

## 2026-10-08 — A display name cannot be an email or a link

Matches, exchanges, and a shared collection show the name a person chose. Register and the account page only checked the length, so that name could be an email address or a web address. Those names are refused. The message is "Use a name that isn't an email address or a link." The check looks for `@`, `http://`, `https://`, and `www.`. It does not try to guess a phone number. A name already saved stays until that person edits it.

## 2026-10-08 — Set filters stay in the address

Choosing a rarity, a condition, a detail such as ink, or a sort used to live only on the page. A refresh, or a copied link, went back to every card in number order. Those choices now stay in the address with the search and the ownership and availability filters. An unknown value is ignored. Show all cards clears those filters and keeps the search and the sort. The owned, missing, extras, and set-size counts on the set do the same job: each one shows that list and clears a narrower filter. Choosing the count that is already on returns to every card.

## 2026-10-08 — Home lists use the set covers

The lists behind the home counts were plain rows of names. They now use the same covers as home and the catalog, so a set you have started still comes first and the progress stays visible. Opening the cover applies the filter for that count. The other shortcuts on the cover stay, without repeating the list you are already on.

## 2026-10-08 — The phone filter list scrolls on its own

Opening filters on a phone used to stack every choice down the page, so the cards moved under the navigation. The filter list now scrolls inside itself. While it is open, the progress summary steps aside, and it comes back when the list closes. The cards stay on screen. A wide screen is unchanged.

## 2026-10-08 — A JPEG photo ends at its end marker

A photo could carry extra bytes after the JPEG end marker, and those bytes were stored with the picture. They are now dropped. A PNG with anything after its end chunk was already rejected. The picture is still not re-encoded.

## 2026-10-08 — A match shows the condition of the copy it would use

The condition note lived on the exchange, after someone had already proposed. A match now shows it first. The copy is the oldest free one a new proposal would reserve, unless this pair already has that card set aside, in which case the reserved copy is shown. A copy reserved for someone else is left out. The score does not change, and the response still does not include the copy id. A public page still does not show condition.

## 2026-10-08 — The first phone card stays above the navigation

A full-width card, with the sample notice and a filter sentence above it, put the first card's name under the navigation. On a phone the set page no longer repeats that sample notice, and the card face is a little shorter, so the name, number, and badges fit. Progress stays. The notice stays on home and on a wide screen. A wide screen still uses the full card face.

## 2026-10-08 — Select these chooses the cards on screen

Marking a group of cards meant turning Select on, then choosing Select visible, then Mark owned. Select these does the first two for the cards on screen. Mark owned is still its own step, so a long list is not added by one tap. Cards you already selected stay selected when you add another group. Unselect visible clears only the cards on screen.

## 2026-10-08 — Catalog search is limited per address

Catalog search is public and reads the whole sample catalog, so a script could ask as fast as the server answers. Each socket address can search 120 times a minute. The page already waits a quarter second after typing stops, so refining a name stays inside that. People on the same network share the limit. A search that is too short or too long still counts, and a search shorter than two characters does not read the catalog. The response is 429 and asks them to wait a minute. Loading the public checklist is a separate limit of the same size. The process still does not trust `X-Forwarded-For`. The test suite raises the limit unless a test sets it.

## 2026-10-08 — A phone search result stays above the navigation

The search box on a phone sits below the sets. A result then opened under the bottom navigation, so the add button was covered even though the browser treated it as on screen. The result now moves up until it clears that bar. The search field does the same when it is focused. A wide screen has no bottom bar, so it does not move.

## 2026-10-08 — Only the set code sits beside the title on a phone

The phone set page puts the set code on the same line as the title. That rule also caught the Add a card instructions, so they continued on from the title. The code is now the only text that sits beside the title. The instructions stay a paragraph under it.

## 2026-10-08 — Account fields clear the navigation on a phone

The password fields sit at the bottom of the account page. On a phone the next field opened underneath the navigation, and focusing it left it there. Focusing a field or the save button now moves it above that bar. A wide screen has no bottom bar.

## 2026-10-08 — Both counts come before the faces on a phone

On a phone the next action sits above the cards. The cards you would receive were then listed in full before the line that says what you would give, so that count was easy to miss. One line with both counts now sits with the action. Each list still has its own heading. A wide screen does not repeat that line, because the two sides are already next to each other.

## 2026-10-08 — A public set checklist is limited on its own

The public checklist returns every card in a set, with no sign-in. It was the catalog read that search's limit did not cover. Each socket address can load it 120 times a minute. That counter is not the search counter: looking up a name does not spend it, and opening a checklist does not spend the search budget. The set list and one set's name stay unlimited, so the catalog page still loads. A missing set still says it was not found, and that attempt still counts. People on the same network share the budget. The signed-in set page reads progress for that account, which is a different request and is not this limit. The process still does not trust `X-Forwarded-For`. The test suite raises the limit unless a test sets it.

## 2026-10-08 — Set search stays on screen

A large set is longer than one screen. Search scrolled away with the title, so finding a card meant returning to the top. Search, filter, sort, and the layout controls now stay under the header while the cards move. Typing a search brings the matches up under those tools, instead of leaving them where the old list was. The title and the progress bar still scroll away. Opening filters brings that list back into view if it has moved off. A public collection already kept its own search on screen.

## 2026-10-08 — Your photo shows on your own card

A front photo lived only inside the card editor, so the grid kept the sample drawing after you attached one. On your own set, the grid and the list now show that photo. The sample drawing stays when there is no photo, or when the photo cannot be loaded. The editor still shows the sample drawing above the copy, next to the photo. A public page, a match, and a search result still use the sample drawing. The photo is still not proof that you hold the card.

## 2026-10-08 — Add sits on the card

A missing card on a wide screen put a full Add button under the name. That card was taller than the ones beside it. Add now sits on the corner of the picture, as it already did on a phone. The list still keeps Add in the row. Mark owned is still a separate step.

## 2026-10-08 — On a phone, an exchange leads with what you receive

The cards you would give were listed first. On a phone the whole give list sat above the receive list, so the cards you would gain were easy to miss. Those cards now come first, and the first one stays above the navigation. A wide screen still shows what you give on the left and what you receive on the right. A match already led with the cards you would receive.

## 2026-10-08 — A catalog kind has its own mark

Cards in a large set were hard to tell apart because every face used a different pattern. A place, person, object, or event now uses one mark, and the kind is written under the name. A card without a kind keeps the pattern. A match and a public page still use the pattern, because those lists do not include the kind.

## 2026-10-08 — The kind mark follows the card

The set page could tell a place from a person, but a search result, a match, an exchange, and a public page still drew a different pattern for every card. Those lists now use the same mark, and the kind is written under the name. The ink color follows the catalog too. A card without a known kind keeps the pattern. The public page still leaves out condition, photos, and any other catalog metadata. Number, name, rarity, and condition on an exchange stay the snapshot from when it was proposed. The kind is read from the current catalog, and it does not change the match score or which copy would be used.

## 2026-10-08 — Home shows the card, not only its name

Recently added cards and the short exchange list on home were text. Each recent card now uses the same sample drawing as the rest of the app, and an exchange row shows up to three of the cards you would receive. When you would receive nothing, it shows the cards you would give. These are the catalog drawings, not a photo of your copy. A photo still stays on your own set.

## 2026-10-08 — A set opens with one of its cards

The set list used a colored block and a code. Each set now shows one card from that set: the one you own with the lowest number, or the first card in the set when you have not started it. The drawing is the same sample mark as the rest of the app, not a photo. The set code stays in the text.

## 2026-10-08 — A match keeps the completion change with its label

On a wide screen the before and after percentages sat at the far edge of the match, away from "Your collection" and "Their collection". They now sit on the same line as that label. A phone still shows the change before the card faces.

## 2026-10-08 — A back photo can be added with the card

Adding a card could save a front photo only. You can also add a photo of the back before the copy is saved. It stays optional. Choosing another front photo clears a back that has not been saved yet. The app does not check that the two photos are the same card, and neither photo proves that you hold it. Recognition still looks at the front only.

## 2026-10-08 — A shortened match is reviewed before it is proposed

Home shows at most three cards on each side of a match. When there are more, the button opens the match instead of proposing it. An open exchange uses the same completion lines as that match, and says whether each person has confirmed.

## 2026-10-08 — An exchange states the privacy limits once

Each open exchange repeated that the app does not message anyone or arrange a meeting. That note now sits once under the page title, so the cards and the next action stay higher on a phone. The match page still says the score is about finishing the set.

## 2026-10-08 — A card's name is the title of its details

The detail panel was titled "Card", and the availability choices wrapped so one sat on a line by itself. The title is now the card's name. Keep, For trade, For sale, and Donation sit in two columns. Comparing two cards still titles the panel Compare and names each card underneath.

## 2026-10-08 — A copy's condition is a set of choices

The condition on a card you already own was a dropdown, and each copy was marked with a bullet. Condition is now Not set, Mint, Near Mint, Excellent, Good, Played, or Poor, in two columns, the same kind of choice as Keep or For trade. Tapping the condition that is already chosen does nothing. A copy held for an exchange stays locked. Adding a card still uses a short list, so the phone add panel can keep the save button on screen. Comparing two cards keeps the title above both of them, so those choices stay on one line. Condition is still your note, not a grade.

## 2026-10-08 — Spare copies are called extras

Home and the counts on a set already said extras, while the filter, the sort, and a public list said duplicates. Those now say extras too. The address still uses ownership=duplicates. Offer duplicates still keeps one copy and marks the rest for trade.

## 2026-10-08 — A public page says what it leaves out

A shared collection shows the name the person chose and the lists they turned on. The page now says it does not show an email, a location, photos, or a card's condition. It stays read-only, and it still does not say who opened the link.

## 2026-10-08 — Offering extras asks first

Offer duplicates used to mark copies for trade as soon as it was chosen. It now asks first. One copy stays, and the extras would be marked for trade. Cancel leaves the collection as it is. A card with only one free copy is named in that question and is not changed.

## 2026-10-08 — Bulk changes ask first

All copies and the condition list used to change every free copy as soon as a choice was picked. They now ask first. Cancel leaves the collection as it is. Copies in an open exchange are still left out.

## 2026-10-08 — Phone bulk actions are easier to tap

The phone selection bar already asked for a 44px target, but the smaller button style won, so Mark owned and the other actions stayed at 36px. Those actions are now 44px tall. The bar still stays on one row until More is opened. A wide screen keeps the shorter buttons.

## 2026-10-08 — Opening More keeps the card in view

On a phone, More makes the selection bar taller, and that bar was covering the card. Opening More now moves the card up until the name and number clear the bar, or until the name meets the search. Choosing another card after that does not jump the page.

## Not done, on purpose

| Item                                   | State                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official card metadata and artwork     | Blocked until a license exists. Sample catalogs are the stand-in.                                                                                                                                           |
| Automatic card identification          | No recognition provider is configured. The app can accept a photo and will say so, but it will not invent a match. A guess, if a provider is added later, still has to be confirmed before a copy is saved. |
| AI condition estimate                  | Not built. Manual condition remains. An estimate would not be a professional grade, and two photos would not prove they are the same card.                                                                  |
| Guided capture                         | Not built. A photo is optional and private. It is not proof of ownership, and the front and back are not checked to be the same card.                                                                       |
| Content-Security-Policy on the web app | The API sends a strict policy. The dev server does not, so its scripts keep working. A production host for the built web app still needs framing, nosniff, and `X-Robots-Tag: noindex, nofollow`.           |
| Native apps                            | Not built. A phone can install the website from the browser. That is still the website.                                                                                                                     |
| Share-link social previews             | Not built. A crawler that does not run JavaScript sees the site description, not one collection. The HTML shell is noindex, so that page is not a public listing.                                           |
| Email password reset                   | Not built. A signed-in person who knows the current password can change it. That signs out other browsers. There is no reset email.                                                                         |
