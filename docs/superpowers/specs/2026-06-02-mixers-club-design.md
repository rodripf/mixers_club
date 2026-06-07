# Mixers Club — Chrome Extension Design Spec

**Date:** 2026-06-02  
**Status:** Approved

## Overview

Mixers Club is a Chrome extension that enriches Cookidoo recipe pages across all regional domains (cookidoo.es, cookidoo.de, cookidoo.com.au, etc.). It injects community content — reviews, ratings, and trending recipes — directly into Cookidoo's interface using only Cookidoo's existing CSS classes and JavaScript. No custom stylesheet or script files are injected into the page.

---

## 1. Architecture

```
Chrome Extension (Manifest V3)
│
├── content-script.ts        ← injected into all cookidoo.* domains
│   ├── page-detector.ts     ← identifies page type (recipe / home / other)
│   ├── recipe-page.ts       ← injects reviews carousel below hero
│   └── home-page.ts         ← injects trending section on main page
│
├── service-worker.ts        ← background; owns auth session + all Supabase calls
│   ├── auth.ts              ← magic link flow, session persistence in chrome.storage.local
│   └── api.ts               ← message handlers for content script requests
│
├── popup.html / popup.ts    ← login/logout UI only
│
└── manifest.json            ← permissions: storage, identity, host_permissions: *://*.cookidoo.*/*

Supabase (hosted)
├── Auth                     ← magic link (passwordless), session management
├── PostgreSQL               ← recipes, reviews, votes tables
└── Row Level Security       ← users can only edit/delete their own data

Development tooling
└── Supabase MCP server      ← used during development to manage schema, RLS policies, and auth config
```

**Communication pattern:** The content script communicates with the service worker exclusively via `chrome.runtime.sendMessage`. The service worker holds the Supabase client and session token, executes all Supabase calls, and returns plain data objects. The content script never accesses Supabase directly.

**DOM detection:** Since Cookidoo is a React SPA, content scripts use a `MutationObserver` to detect when target elements appear after initial load. If the target element is not found within 10 seconds, a console error is logged with the domain and full page URL for diagnosis. The rest of the page is unaffected.

**Secrets policy:** The extension bundle contains **only** the Supabase project URL and the `anon` (publishable) key. The `anon` key is safe to ship in client code — all data access is enforced by Row Level Security on the database, not by key privilege. The `service_role` key (which bypasses RLS) is **never** included in the extension and is used only by the Supabase MCP server during development and by any server-side tooling. No secret with management power lives in the extension code.

---

## 2. Data Model

```sql
-- A recipe is identified by its Cookidoo ID + domain
recipes
  id          uuid  PK
  cookidoo_id text  NOT NULL   -- extracted from URL (e.g. "r123456")
  domain      text  NOT NULL   -- e.g. "cookidoo.es"
  UNIQUE (cookidoo_id, domain)

users
  id          uuid  PK         -- matches Supabase auth.users.id
  username    text  NOT NULL UNIQUE
  email       text  NOT NULL   -- used only for Gravatar MD5 hash, never displayed

reviews
  id          uuid  PK
  recipe_id   uuid  FK → recipes.id
  user_id     uuid  FK → users.id
  type        text  CHECK (type IN ('improvement','variation','comment','warning','other'))
  body        text  NOT NULL
  stars       int   CHECK (stars BETWEEN 1 AND 5)
  created_at  timestamptz DEFAULT now()

votes
  id          uuid  PK
  review_id   uuid  FK → reviews.id
  user_id     uuid  FK → users.id
  value       int   CHECK (value IN (1, -1))   -- 1 = like, -1 = dislike
  UNIQUE (review_id, user_id)                  -- one vote per user per review
```

**Hiding rule (applied client-side):** A review is hidden if `net_score < -3` AND `dislike_ratio > 0.5`. Both conditions must be met simultaneously.

**Sort order:** Reviews are sorted by net score descending (most liked first). Hidden reviews are excluded from the rendered carousel entirely.

**Trending formula (computed at query time):**
```
score = avg_stars * log(1 + review_count)
```
This rewards recipes with both high ratings and volume. Scoped to the current calendar month.

---

## 3. DOM Injection

Cookidoo uses custom HTML elements (`<recipe-details>`, `<core-stripe>`, `<core-tile>`, etc.) with BEM-namespaced CSS classes from a pattern library at `patternlib-all.prod.external.eu-tm-prod.vorwerk-digital.com`. Authentication state is reflected on `<html class="cicd2-theme is-authenticated">` or `is-unauthenticated`. Visibility is controlled with `authenticated-only` / `unauthenticated-only` classes on elements.

### Recipe pages (`/recipes/recipe/{locale}/{id}`)

**Injection point:** Insert our section immediately after `</recipe-card>` and before `<recipe-content>` within `<recipe-details id="main-content">`.

**MutationObserver target:** `recipe-details#main-content` — wait for `recipe-card` to appear.

**Recipe ID:** Extracted from URL path (e.g. `r268795`). Domain from `window.location.hostname`.

**Reviews section HTML structure** (using Cookidoo's own components and classes):
```html
<section class="wf-spacing-bottom" id="mixers-club-reviews">
  <core-stripe class="core-stripe--modern" role="region" aria-labelledby="mc-stripe-header">
    <h3 class="core-stripe__header" id="mc-stripe-header">Mixers Club's Reviews</h3>
    <!-- filter chips -->
    <div>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small core-chip-button--active">All</button>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">Improvement</button>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">Variation</button>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">Comment</button>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">Warning</button>
      <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">Other</button>
    </div>
    <div class="core-stripe__content">
      <!-- one <core-tile> per review -->
      <core-tile>
        <div class="core-tile__description-wrapper">
          <div class="core-tile__description">
            <img src="https://www.gravatar.com/avatar/<md5>?d=identicon&s=48" alt="username">
            <p class="core-tile__description-text">username · type badge</p>
            <core-rating>
              <div class="core-rating__rating-list">
                <span class="core-rating__point core-rating__point--full"></span>
                <!-- repeated per star value -->
              </div>
            </core-rating>
            <p class="core-tile__description-subline">review body text</p>
            <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">+12</button>
            <button class="core-chip-button core-chip-button--flat core-chip-button--x-small">-2</button>
          </div>
        </div>
      </core-tile>
    </div>
    <a class="button--primary authenticated-only" id="mc-add-review">Add your review</a>
    <a class="button--primary unauthenticated-only" id="mc-login-to-review">Login to review</a>
  </core-stripe>
</section>
```

### Home pages (`/foundation/{locale}/for-you`)

**Injection point:** Prepend as first child of `<div class="l-main bg-white">`.

**MutationObserver target:** `div.l-main` — wait for first `<section>` to appear.

**Trending section HTML structure:**
```html
<section class="wf-spacing-bottom" id="mixers-club-trending">
  <core-stripe class="core-stripe--modern" role="region" aria-labelledby="mc-trending-header">
    <h3 class="core-stripe__header" id="mc-trending-header">Mixers Club — Trending This Month</h3>
    <div class="core-stripe__content">
      <!-- one <core-tile> per trending recipe -->
      <core-tile>
        <a class="link--alt" href="/recipes/recipe/{locale}/{id}">
          <div class="core-tile__description-wrapper">
            <div class="core-tile__description">
              <p class="core-tile__description-text">Recipe Name</p>
              <core-rating class="core-rating--short core-rating--small">
                <span class="core-rating__counter">4.5</span>
                <span class="core-rating__point core-rating__point--full"></span>
                <span class="core-rating__label">(23)</span>
              </core-rating>
            </div>
          </div>
        </a>
      </core-tile>
    </div>
  </core-stripe>
</section>
```

Trending data is fetched once on page load (no live refresh).

---

## 4. Authentication

**Method:** Magic link (passwordless email via Supabase Auth)  
**Session:** Persistent — stored in `chrome.storage.local`, restored on every service worker startup

### Flow

1. User clicks extension icon → popup opens with email input and "Send magic link" button
2. Popup sends `{ action: 'sendMagicLink', email }` to service worker
3. Service worker calls `supabase.auth.signInWithOtp({ email })`
4. Popup shows "Check your email" confirmation
5. User clicks the link → Supabase redirects to an extension-internal page (`chrome-extension://<id>/auth.html`) registered as the redirect URL in Supabase Auth settings. This page extracts the token from the URL hash and calls `chrome.runtime.sendMessage({ action: 'authCallback', token })` to pass it to the service worker. The extension ID is stable per browser profile.
6. Service worker receives the token, calls `supabase.auth.setSession()`, persists session in `chrome.storage.local`
7. `supabase.auth.onAuthStateChange` keeps `chrome.storage.local` in sync on all subsequent changes

**First login:** If no record exists in the `users` table after confirmation, the popup prompts for a username before closing.

**Popup logged-in state:** Shows username and a "Log out" button. Logout calls `supabase.auth.signOut()` and clears `chrome.storage.local`.

---

## 5. Review Submission

### Form (inline, expands below carousel on button click)

- **Post type selector:** segmented button group (improvement / variation / comment / warning / other) using Cookidoo's classes
- **Star rating:** a clone of Cookidoo's `<core-rating>` structure injected into the form
  ```html
  <core-rating id="mc-star-input">
    <div class="core-rating__rating-list">
      <span class="core-rating__point" data-value="1"></span>
      <span class="core-rating__point" data-value="2"></span>
      <span class="core-rating__point" data-value="3"></span>
      <span class="core-rating__point" data-value="4"></span>
      <span class="core-rating__point" data-value="5"></span>
    </div>
  </core-rating>
  ```
  - If the user has already rated, spans get `core-rating__point--full` (or `--half`) to match their existing vote
  - If not yet rated, all spans render without modifier classes (empty/idle state) — no text shown
  - Clicking a span programmatically clicks the corresponding star on Cookidoo's real interactive rating component (found via its DOM selector in the authenticated page)
  - A `MutationObserver` on Cookidoo's real rating component detects the vote confirmation, updates the clone's classes and stores the value
  - Submission is blocked if no star value is captured — the empty stars serve as the visual cue
- **Body:** `<textarea>` using Cookidoo's input styles
- **Submit button**

### Submission flow

1. Content script sends `{ action: 'addReview', recipeId, type, stars, body }` to service worker
2. Service worker upserts the `recipes` row (by cookidoo_id + domain) if not exists, then inserts the review
3. On success: new review prepended to carousel without page reload
4. On error: logged to console, inline error message using Cookidoo's error/alert class

### Voting

- Like/dislike buttons send `{ action: 'vote', reviewId, value }` to service worker
- Service worker upserts the `votes` row (one per user per review)
- Card updates counts optimistically in the DOM

### "Login to review" button

- Clicking it sends `{ action: 'openPopup' }` to the service worker, which opens the extension popup programmatically

---

## 6. Error Handling

- DOM target not found within 10s → `console.error` with domain + page URL
- Review submission failure → `console.error` + inline error message in Cookidoo's alert style
- Supabase call failures → `console.error` with action name + error details
- Auth failures → logged + popup shows error state

No user-visible error UI beyond inline messages. No crash reporting service in v1.

---

## 7. Out of Scope (v1)

- Push notifications
- Editing or deleting reviews after submission
- Admin moderation panel
- Community flagging
- Real-time review updates (reviews load once on page load)
- Support for non-Cookidoo domains
