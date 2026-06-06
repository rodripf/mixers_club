# Security Fixes Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all OWASP Top 10, IDOR, and credential-handling issues identified in the security audit.

**Architecture:** Sequential: Supabase audit and migrations first (constraint names inform the error message map), then service-worker security fixes, then input validation and error mapping, then cleanup. Single branch, single PR.

**Tech Stack:** TypeScript, Supabase JS v2 (MCP for migrations), Chrome Extension MV3, Vite, Vitest, pnpm

---

## Section 1 — Supabase Audit & Migrations

### 1a. RLS Audit

Use the Supabase MCP to read current RLS policies on all four tables. For each table verify:
- RLS is enabled
- Every operation (SELECT, INSERT, UPDATE, DELETE) has a policy
- Each policy is tight enough (not `true` for operations that require ownership)

Expected correct state:

**`reviews`**
- SELECT: allow anon (public reviews)
- INSERT: `auth.uid() IS NOT NULL`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

**`votes`**
- SELECT: allow anon
- INSERT: `auth.uid() IS NOT NULL`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

**`users`**
- SELECT: allow anon (needed for `get_reviews_for_recipe`)
- INSERT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`
- DELETE: disallowed

**`recipes`**
- SELECT: allow anon
- INSERT: `auth.uid() IS NOT NULL`
- UPDATE: disallowed (no user should update recipe metadata directly — it is owned by the system)
- DELETE: disallowed

Write a migration for any gaps found.

### 1b. Schema Constraints Migration

```sql
-- Username uniqueness (generates constraint name: users_username_key)
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);

-- Username format and length enforced at DB level
ALTER TABLE users ADD CONSTRAINT users_username_check
  CHECK (char_length(username) BETWEEN 1 AND 30 AND username ~ '^[\w-]+$');

-- Review body max length
ALTER TABLE reviews ADD CONSTRAINT reviews_body_length_check
  CHECK (char_length(body) <= 2000);
```

Note: if these constraints already exist, skip gracefully with `IF NOT EXISTS` or wrap in a DO block.

---

## Section 2 — Service Worker Security Fixes

### 2a. Strip tokens from content-script session (`src/types.ts`, `src/service-worker/auth.ts`)

Split `Session` into two types:

```ts
// Public: what content scripts receive
export interface PublicSession {
  userId: string
  email: string
  username: string | null
}

// Private: internal SW use only — not sent across message boundary
export interface PrivateSession extends PublicSession {
  accessToken: string
  refreshToken: string
}
```

`handleGetSession` returns `MessageResponse<PublicSession>`. Remove `accessToken` and `refreshToken` from the returned object. The Supabase client manages tokens internally via `chrome.storage.local` — the content script never needs them.

Update all content-script call sites (`recipe-page/index.ts`, `auth-modal.ts`) that typed the response as `Session` to use `PublicSession`.

### 2b. Recipe upsert poisoning fix (`src/service-worker/api.ts`)

Change `handleAddReview` recipe upsert from:
```ts
{ onConflict: 'cookidoo_id,domain' }
```
to:
```ts
{ onConflict: 'cookidoo_id,domain', ignoreDuplicates: true }
```

When `(cookidoo_id, domain)` already exists, the row is left unchanged. Recipe metadata is only written on first insert.

### 2c. Cache invalidation IDOR fix (`src/service-worker/api.ts`)

Both `handleUpdateReview` and `handleDeleteReview` must check that the operation actually affected a row before invalidating the cache.

Chain `.select('id')` on the query — Supabase returns the affected rows, so `data.length === 0` means nothing matched:

```ts
// handleUpdateReview
const { data, error } = await supabase
  .from('reviews')
  .update({ type: msg.type, body: msg.body, stars: msg.stars })
  .eq('id', msg.reviewId)
  .eq('user_id', sessionData.session.user.id)
  .select('id')
if (error) return { data: null, error: error.message }
if (!data || data.length === 0) return { data: null, error: 'Review not found or not yours' }
await invalidateReviewsCache(msg.cookidooId)
return { data: undefined, error: null }

// handleDeleteReview — same pattern (.delete().eq().eq().select('id'), check data.length)
```

This also closes the false-success response on IDOR attempts.

---

## Section 3 — Input Validation

### 3a. Username validation (`src/service-worker/auth.ts`)

In `handleSetUsername`, after the existing empty-string check, add:

```ts
if (trimmed.length > 30) return { data: null, error: 'Username must be 30 characters or fewer' }
if (!/^[\w-]+$/.test(trimmed)) return { data: null, error: 'Username can only contain letters, numbers, underscores, and hyphens' }
```

These mirror the DB `CHECK` constraint added in section 1b. The content-script already displays `result.error` so no UI change is needed here (the friendly mapper in section 4 will further transform these strings if needed, though these are already user-friendly).

### 3b. Review body max length (`src/content-script/recipe-page/review-form.ts`)

Add to the textarea:
```ts
textarea.maxLength = 2000
```

Add a character counter below the textarea:
```ts
const counter = document.createElement('p')
counter.style.cssText = 'margin:0 0 8px;font-size:0.75rem;color:#9ca3af;text-align:right'
counter.textContent = `0 / 2000`
textarea.addEventListener('input', () => {
  counter.textContent = `${textarea.value.length} / 2000`
})
container.insertBefore(counter, errorEl)
```

### 3c. Translation API shape validation (`src/content-script/dom-helpers.ts`)

In `translateText`, add a runtime guard before mapping:

```ts
const data = await resp.json() as Array<unknown>
if (!Array.isArray(data) || !Array.isArray(data[0])) {
  throw new Error('Unexpected translation response shape')
}
return (data[0] as Array<[string]>).map(chunk => chunk[0]).join('')
```

The existing `catch` in the caller already resets the button text gracefully.

---

## Section 4 — Error Message Mapping

### 4a. New file: `src/content-script/error-map.ts`

```ts
import { t } from '../i18n'

export function friendlyError(raw: string): string {
  console.error('[Mixers Club] Supabase error:', raw)
  if (raw.includes('users_username_key')) return t('errUsernameTaken')
  if (raw.includes('Email rate limit exceeded')) return t('errEmailRateLimit')
  if (raw.includes('char_length')) return t('errInputTooLong')
  return t('errGeneric')
}
```

Note: the `users_username_key` string matches the constraint name explicitly set in migration 1b, so this is reliable. The other strings should be verified against live Supabase error output during testing and adjusted if they differ.

### 4b. New i18n keys (`src/i18n.ts`)

Add to all four languages (`en`, `es`, `pt`, `it`):

| Key | EN | ES | PT | IT |
|-----|----|----|----|----|
| `errUsernameTaken` | Username is already taken | El nombre de usuario ya está en uso | Nome de utilizador já em uso | Nome utente già in uso |
| `errEmailRateLimit` | Too many attempts, please wait a few minutes | Demasiados intentos, espera unos minutos | Demasiadas tentativas, aguarda alguns minutos | Troppi tentativi, attendi qualche minuto |
| `errInputTooLong` | Input exceeds maximum length | El texto supera la longitud máxima | O texto excede o comprimento máximo | Il testo supera la lunghezza massima |
| `errGeneric` | Something went wrong, please try again | Algo salió mal, inténtalo de nuevo | Algo correu mal, tenta novamente | Qualcosa è andato storto, riprova |

### 4c. Replace raw errors in UI

In `src/content-script/auth-modal.ts`, replace all occurrences of:
```ts
errorEl.textContent = `Error: ${result.error}`
```
with:
```ts
errorEl.textContent = friendlyError(result.error ?? '')
```

Same replacement in `src/content-script/recipe-page/review-form.ts`.

---

## Section 5 — Cleanup

### 5a. Remove stale devDependency

```bash
pnpm remove -D @types/blueimp-md5
```

### 5b. Scope `auth-callback.html` in manifest (`public/manifest.json`)

Change:
```json
"web_accessible_resources": [{ "resources": ["auth-callback.html"], "matches": ["<all_urls>"] }]
```
to:
```json
"web_accessible_resources": [{ "resources": ["auth-callback.html"], "matches": ["https://*.supabase.co/*"] }]
```

---

## Testing

- All existing 65 Vitest tests must continue to pass after each task.
- Update `tests/service-worker/api.test.ts` to cover:
  - `handleUpdateReview` returns error when 0 rows affected (IDOR attempt)
  - `handleDeleteReview` returns error when 0 rows affected
  - Cache is NOT invalidated when 0 rows affected
- Update `tests/service-worker/api.test.ts` for `handleAddReview`:
  - upsert called with `ignoreDuplicates: true`
- Add test for `friendlyError` in a new `tests/content-script/error-map.test.ts`.
- Manually verify each error condition triggers the correct friendly message.

---

## Files Changed

| File | Action |
|------|--------|
| Supabase migration: RLS patches | Create |
| Supabase migration: schema constraints | Create |
| `src/types.ts` | Modify — split `Session` into `PublicSession` / `PrivateSession` |
| `src/service-worker/auth.ts` | Modify — return `PublicSession`, add username validation |
| `src/service-worker/api.ts` | Modify — `ignoreDuplicates`, count-check on update/delete |
| `src/content-script/error-map.ts` | Create |
| `src/i18n.ts` | Modify — 4 new keys × 4 languages |
| `src/content-script/auth-modal.ts` | Modify — use `friendlyError` |
| `src/content-script/recipe-page/review-form.ts` | Modify — `maxLength`, counter, `friendlyError` |
| `src/content-script/dom-helpers.ts` | Modify — translation shape guard |
| `public/manifest.json` | Modify — scope `auth-callback.html` |
| `package.json` + `pnpm-lock.yaml` | Modify — remove `@types/blueimp-md5` |
| `tests/service-worker/api.test.ts` | Modify — new IDOR and ignoreDuplicates tests |
| `tests/content-script/error-map.test.ts` | Create |
