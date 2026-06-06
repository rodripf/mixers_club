# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all OWASP Top 10, IDOR, and credential-handling issues identified in the security audit — Supabase RLS and schema constraints first, then service-worker and content-script code fixes, then cleanup.

**Architecture:** Sequential tasks ordered so DB constraint names (added in Tasks 1–2) are known before the error message mapper (Task 9) is written. Each task is independently committable. All 65 existing Vitest tests must stay green throughout.

**Tech Stack:** TypeScript, Supabase JS v2, Supabase MCP (`mcp__plugin_supabase_supabase__*`), Chrome Extension MV3, Vite, Vitest, pnpm

---

## File Map

| File | Role | Tasks |
|------|------|-------|
| Supabase migration: `rls_audit_patch` | Idempotent RLS policies for all 4 tables | 1 |
| Supabase migration: `schema_constraints` | UNIQUE + CHECK constraints | 2 |
| `src/types.ts` | Remove tokens from `Session` → rename `PublicSession` | 3 |
| `src/service-worker/auth.ts` | Return `PublicSession`, add username validation | 3, 6 |
| `src/service-worker/api.ts` | `ignoreDuplicates`, row-count IDOR fix | 4, 5 |
| `src/content-script/recipe-page/index.ts` | Update Session import | 3 |
| `src/content-script/auth-modal.ts` | Update Session import, use `friendlyError` | 3, 9 |
| `src/content-script/recipe-page/review-form.ts` | `maxLength` + counter, use `friendlyError` | 7, 9 |
| `src/content-script/dom-helpers.ts` | Translation shape guard | 8 |
| `src/content-script/error-map.ts` | New — friendly error mapper | 9 |
| `src/i18n.ts` | 4 new error keys × 4 languages | 9 |
| `public/manifest.json` | Scope `auth-callback.html` | 10 |
| `package.json` | Remove stale devDep | 10 |
| `tests/service-worker/api.test.ts` | New tests for Tasks 4 & 5 | 4, 5 |
| `tests/content-script/error-map.test.ts` | New — unit tests for `friendlyError` | 9 |

---

## Task 1: Supabase RLS Audit and Patch

**Files:** Supabase migration (applied via MCP)

- [ ] **Step 1: Inspect current RLS policies**

Use the `mcp__plugin_supabase_supabase__execute_sql` tool with this query to see what policies currently exist:

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reviews', 'votes', 'users', 'recipes')
ORDER BY tablename, cmd;
```

Read the output. Note any missing policies — the migration in the next step is idempotent and will cover all gaps regardless.

- [ ] **Step 2: Apply RLS migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `rls_audit_patch` and the following SQL. The `DROP POLICY IF EXISTS` pattern makes this safe to run even if some policies already exist.

```sql
-- ── Enable RLS (idempotent) ─────────────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- ── reviews ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews_select" ON reviews;
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "reviews_insert" ON reviews;
CREATE POLICY "reviews_insert" ON reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "reviews_update" ON reviews;
CREATE POLICY "reviews_update" ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_delete" ON reviews;
CREATE POLICY "reviews_delete" ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- ── votes ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "votes_select" ON votes;
CREATE POLICY "votes_select" ON votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "votes_insert" ON votes;
CREATE POLICY "votes_insert" ON votes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "votes_update" ON votes;
CREATE POLICY "votes_update" ON votes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes_delete" ON votes;
CREATE POLICY "votes_delete" ON votes FOR DELETE
  USING (auth.uid() = user_id);

-- ── users ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE
  USING (auth.uid() = id);

-- users DELETE intentionally omitted (accounts cannot be self-deleted)

-- ── recipes ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recipes_select" ON recipes;
CREATE POLICY "recipes_select" ON recipes FOR SELECT USING (true);

DROP POLICY IF EXISTS "recipes_insert" ON recipes;
CREATE POLICY "recipes_insert" ON recipes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- recipes UPDATE and DELETE intentionally omitted:
-- recipe metadata is owned by the system; no user should modify it directly.
-- The code-side fix (ignoreDuplicates in Task 4) prevents client overwrites.
```

- [ ] **Step 3: Verify migration applied**

Use `mcp__plugin_supabase_supabase__execute_sql` to re-run the Step 1 query. Confirm all expected policies now appear for all 4 tables.

---

## Task 2: Supabase Schema Constraints

**Files:** Supabase migration (applied via MCP)

- [ ] **Step 1: Apply schema constraints migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `schema_constraints` and the following SQL. The `DO` blocks make it idempotent.

```sql
-- ── Username uniqueness ──────────────────────────────────────────────────────
-- Constraint name: users_username_key (used by error-map.ts in Task 9)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- ── Username format / length ──────────────────────────────────────────────────
-- Allows: letters, numbers, underscores, hyphens. Max 30 chars.
-- Constraint name: users_username_check (used by error-map.ts in Task 9)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_check
      CHECK (char_length(username) BETWEEN 1 AND 30 AND username ~ '^[\w\-]+$');
  END IF;
END $$;

-- ── Review body max length ────────────────────────────────────────────────────
-- Constraint name: reviews_body_length_check (used by error-map.ts in Task 9)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_body_length_check'
  ) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_body_length_check
      CHECK (char_length(body) <= 2000);
  END IF;
END $$;
```

- [ ] **Step 2: Verify constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('users_username_key', 'users_username_check', 'reviews_body_length_check');
```

Expected: 3 rows, one for each constraint.

---

## Task 3: Strip Tokens from Content-Script Session

**Files:**
- Modify: `src/types.ts`
- Modify: `src/service-worker/auth.ts`
- Modify: `src/content-script/recipe-page/index.ts`
- Modify: `src/content-script/auth-modal.ts`

Context: `handleGetSession` currently returns `accessToken` and `refreshToken` to content scripts. Content scripts never use them. Stripping them reduces the attack surface. The Supabase client manages tokens internally via `chrome.storage.local` and does not need them sent across the message boundary.

- [ ] **Step 1: Update `src/types.ts` — rename `Session` to `PublicSession` and remove token fields**

Find the `Session` interface (currently around line 42) and replace it:

```ts
// BEFORE:
export interface Session {
  userId: string
  username: string | null
  email: string
  accessToken: string
  refreshToken: string
}

// AFTER:
export interface PublicSession {
  userId: string
  email: string
  username: string | null
}
```

- [ ] **Step 2: Update `src/service-worker/auth.ts` — return `PublicSession`**

Change the import and return type of `handleGetSession`:

```ts
// Add to imports at top:
import type { MessageResponse, PublicSession } from '../types'

// Change function signature:
export async function handleGetSession(): Promise<MessageResponse<PublicSession | null>> {

// Change the return object (remove accessToken and refreshToken):
  return {
    data: {
      userId: user.id,
      email: user.email ?? '',
      username: profile?.username ?? null,
    },
    error: null,
  }
```

The full `handleGetSession` after the change:

```ts
export async function handleGetSession(): Promise<MessageResponse<PublicSession | null>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return { data: null, error: error.message }
  if (!data.session) return { data: null, error: null }

  const { user } = data.session
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single()

  return {
    data: {
      userId: user.id,
      email: user.email ?? '',
      username: profile?.username ?? null,
    },
    error: null,
  }
}
```

- [ ] **Step 3: Update `src/content-script/recipe-page/index.ts`**

Change the import and type parameter:

```ts
// Change this import line (near top of file):
import type { Message, Review, ReviewType, Session } from '../../types'
// to:
import type { Message, PublicSession, Review, ReviewType } from '../../types'

// Change line ~29 (inside initRecipePage):
send<Session>({ action: 'getSession' }),
// to:
send<PublicSession>({ action: 'getSession' }),
```

- [ ] **Step 4: Update `src/content-script/auth-modal.ts`**

```ts
// Change this import line:
import type { Message, Session } from '../types'
// to:
import type { Message, PublicSession } from '../types'

// Change the getSession call (inside showEmailSent, around line 161):
const result = await send<Session>({ action: 'getSession' })
// to:
const result = await send<PublicSession>({ action: 'getSession' })
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm run typecheck
```

Expected: no errors. If `Session` is referenced anywhere else, TypeScript will tell you — rename those references to `PublicSession`.

- [ ] **Step 6: Run tests**

```bash
rtk vitest run
```

Expected: 65 tests passing.

- [ ] **Step 7: Commit**

```bash
rtk git add src/types.ts src/service-worker/auth.ts src/content-script/recipe-page/index.ts src/content-script/auth-modal.ts
rtk git commit -m "security: strip access/refresh tokens from content-script session response"
```

---

## Task 4: Fix Recipe Upsert Data Poisoning

**Files:**
- Modify: `src/service-worker/api.ts`
- Modify: `tests/service-worker/api.test.ts`

Context: `handleAddReview` upserts the recipe row with `onConflict: 'cookidoo_id,domain'`. When the recipe already exists, this updates `name` and `image_url` with whatever the client sent — any logged-in user can corrupt recipe metadata. Fixing with `ignoreDuplicates: true` means existing rows are left unchanged.

- [ ] **Step 1: Write the failing test**

Add this new describe block at the end of `tests/service-worker/api.test.ts`:

```ts
describe('handleAddReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts recipe with ignoreDuplicates: true to prevent data poisoning', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'recipe-id' }, error: null })
    const mockSelectRecipe = vi.fn().mockReturnValue({ single: mockSingle })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectRecipe })

    const mockSingleRev = vi.fn().mockResolvedValue({
      data: { id: 'rev-id', recipe_id: 'recipe-id', user_id: 'uid-1', type: 'comment', body: 'good', stars: 5, created_at: '' },
      error: null,
    })
    const mockSelectRev = vi.fn().mockReturnValue({ single: mockSingleRev })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelectRev })

    const mockSingleUser = vi.fn().mockResolvedValue({ data: { username: 'u', email_hash: 'abc' }, error: null })
    const mockEqUser = vi.fn().mockReturnValue({ single: mockSingleUser })
    const mockSelectUser = vi.fn().mockReturnValue({ eq: mockEqUser })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { upsert: mockUpsert }
      if (table === 'reviews') return { insert: mockInsert }
      if (table === 'users') return { select: mockSelectUser }
      return {}
    })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleAddReview } = await import('../../src/service-worker/api')
    await handleAddReview({
      action: 'addReview', cookidooId: 'r1', domain: 'cookidoo.es',
      recipeName: 'Test', type: 'comment', stars: 5, body: 'good',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ cookidoo_id: 'r1' }),
      expect.objectContaining({ onConflict: 'cookidoo_id,domain', ignoreDuplicates: true })
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk vitest run tests/service-worker/api.test.ts
```

Expected: FAIL — the upsert is called without `ignoreDuplicates: true`.

- [ ] **Step 3: Fix `src/service-worker/api.ts`**

Find the upsert call in `handleAddReview` (around line 52) and change:

```ts
// BEFORE:
      { onConflict: 'cookidoo_id,domain' }

// AFTER:
      { onConflict: 'cookidoo_id,domain', ignoreDuplicates: true }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
rtk vitest run
```

Expected: 66 tests passing (65 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
rtk git add src/service-worker/api.ts tests/service-worker/api.test.ts
rtk git commit -m "security: prevent recipe data poisoning via ignoreDuplicates upsert"
```

---

## Task 5: Fix Cache Invalidation IDOR

**Files:**
- Modify: `src/service-worker/api.ts`
- Modify: `tests/service-worker/api.test.ts`

Context: `handleUpdateReview` and `handleDeleteReview` call `invalidateReviewsCache(msg.cookidooId)` even when 0 rows were affected (i.e., a user targeting another user's review). This lets any authenticated user blow the cache for any recipe. Fix: chain `.select('id')` on the DB query to get the affected rows back, and only invalidate cache if `data.length > 0`. Also returns an honest error instead of a false-success response.

- [ ] **Step 1: Write failing tests for `handleUpdateReview`**

Add this describe block to `tests/service-worker/api.test.ts`:

```ts
describe('handleUpdateReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalidates cache and returns success when review is owned by user', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'rev-uuid' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleUpdateReview } = await import('../../src/service-worker/api')
    const result = await handleUpdateReview({
      action: 'updateReview', reviewId: 'rev-uuid', cookidooId: 'r1',
      type: 'comment', stars: 5, body: 'updated body',
    })

    expect(result.error).toBeNull()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('mc_reviews_r1')
  })

  it('returns error and does NOT invalidate cache when 0 rows matched (IDOR attempt)', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleUpdateReview } = await import('../../src/service-worker/api')
    const result = await handleUpdateReview({
      action: 'updateReview', reviewId: 'other-users-rev', cookidooId: 'r1',
      type: 'comment', stars: 1, body: 'malicious',
    })

    expect(result.error).toBe('Review not found or not yours')
    expect(chrome.storage.local.remove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write failing tests for `handleDeleteReview`**

Add this describe block to `tests/service-worker/api.test.ts`:

```ts
describe('handleDeleteReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalidates cache and returns success when review is owned by user', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'rev-uuid' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleDeleteReview } = await import('../../src/service-worker/api')
    const result = await handleDeleteReview({
      action: 'deleteReview', reviewId: 'rev-uuid', cookidooId: 'r1',
    })

    expect(result.error).toBeNull()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('mc_reviews_r1')
  })

  it('returns error and does NOT invalidate cache when 0 rows matched (IDOR attempt)', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleDeleteReview } = await import('../../src/service-worker/api')
    const result = await handleDeleteReview({
      action: 'deleteReview', reviewId: 'other-users-rev', cookidooId: 'r1',
    })

    expect(result.error).toBe('Review not found or not yours')
    expect(chrome.storage.local.remove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
rtk vitest run tests/service-worker/api.test.ts
```

Expected: 4 new tests FAIL.

- [ ] **Step 4: Fix `handleUpdateReview` in `src/service-worker/api.ts`**

Replace the function body:

```ts
export async function handleUpdateReview(
  msg: Extract<Message, { action: 'updateReview' }>
): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

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
}
```

- [ ] **Step 5: Fix `handleDeleteReview` in `src/service-worker/api.ts`**

Replace the function body:

```ts
export async function handleDeleteReview(
  msg: Extract<Message, { action: 'deleteReview' }>
): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', msg.reviewId)
    .eq('user_id', sessionData.session.user.id)
    .select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Review not found or not yours' }
  await invalidateReviewsCache(msg.cookidooId)
  return { data: undefined, error: null }
}
```

- [ ] **Step 6: Run all tests**

```bash
rtk vitest run
```

Expected: 70 tests passing (66 from prior task + 4 new).

- [ ] **Step 7: Commit**

```bash
rtk git add src/service-worker/api.ts tests/service-worker/api.test.ts
rtk git commit -m "security: fix cache invalidation IDOR — verify row ownership before cache bust"
```

---

## Task 6: Add Username Validation

**Files:**
- Modify: `src/service-worker/auth.ts`
- Modify: `tests/service-worker/api.test.ts` (or a new auth test file — add to api.test.ts for simplicity)

Context: `handleSetUsername` only rejects empty strings. Adding a max-length and charset check mirrors the DB constraints added in Task 2 and gives users a clear error before the DB is ever hit.

- [ ] **Step 1: Write failing tests**

Add to `tests/service-worker/api.test.ts`:

```ts
describe('handleSetUsername', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects usernames longer than 30 characters', async () => {
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('a'.repeat(31))
    expect(result.error).toBe('Username must be 30 characters or fewer')
  })

  it('rejects usernames with invalid characters', async () => {
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('bad username!')
    expect(result.error).toBe('Username can only contain letters, numbers, underscores, and hyphens')
  })

  it('accepts valid usernames', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1', email: 'a@b.com' } } }, error: null })
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('chef_rodriguez-99')
    expect(result.error).toBeNull()
  })
})
```

Note: `handleSetUsername` is in `src/service-worker/auth.ts`. The test file already imports from `../../src/service-worker/api` — add this import alongside:
```ts
// At the top of the test file, the supabase mock already covers auth.ts too
// since both import from the same mock path.
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
rtk vitest run tests/service-worker/api.test.ts
```

Expected: 3 new tests FAIL (length and charset checks don't exist yet).

- [ ] **Step 3: Add validation to `src/service-worker/auth.ts`**

In `handleSetUsername`, after the empty-string check, add:

```ts
export async function handleSetUsername(username: string): Promise<MessageResponse> {
  const trimmed = username.trim()
  if (!trimmed) return { data: null, error: 'Username cannot be empty' }
  if (trimmed.length > 30) return { data: null, error: 'Username must be 30 characters or fewer' }
  if (!/^[\w-]+$/.test(trimmed)) return { data: null, error: 'Username can only contain letters, numbers, underscores, and hyphens' }

  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!data.session) return { data: null, error: 'Not authenticated' }

  const email_hash = await sha256hex(data.session.user.email ?? '')
  const { error } = await supabase.from('users').upsert({
    id: data.session.user.id,
    username: trimmed,
    email_hash,
  })
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}
```

- [ ] **Step 4: Run all tests**

```bash
rtk vitest run
```

Expected: 73 tests passing.

- [ ] **Step 5: Commit**

```bash
rtk git add src/service-worker/auth.ts tests/service-worker/api.test.ts
rtk git commit -m "security: validate username length and charset before DB write"
```

---

## Task 7: Review Body Max Length and Character Counter

**Files:**
- Modify: `src/content-script/recipe-page/review-form.ts`

Context: The textarea has no length limit. Adding `maxLength = 2000` (matching the DB CHECK constraint) prevents the browser from allowing oversized input. The character counter gives users visibility.

There is no unit test for DOM-building code — verify this task manually by loading the extension, opening a recipe page, and checking the textarea.

- [ ] **Step 1: Add `maxLength` and character counter to `src/content-script/recipe-page/review-form.ts`**

Find the textarea creation block (around line 76–82). Replace it:

```ts
  // Textarea
  const textarea = document.createElement('textarea')
  textarea.id = 'mc-body'
  textarea.rows = 4
  textarea.maxLength = 2000
  textarea.placeholder = t('formBodyPlaceholder')
  textarea.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;margin:8px 0 2px'
  if (opts.initial?.body) textarea.value = opts.initial.body
  container.appendChild(textarea)

  const counter = document.createElement('p')
  counter.style.cssText = 'margin:0 0 8px;font-size:0.75rem;color:#9ca3af;text-align:right'
  counter.textContent = `${textarea.value.length} / 2000`
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 2000`
  })
  container.appendChild(counter)
```

- [ ] **Step 2: Run tests (nothing changes, just confirming no regression)**

```bash
rtk vitest run
```

Expected: 73 tests passing.

- [ ] **Step 3: Commit**

```bash
rtk git add src/content-script/recipe-page/review-form.ts
rtk git commit -m "ux: add review body maxLength (2000) and character counter"
```

---

## Task 8: Translation API Shape Guard

**Files:**
- Modify: `src/content-script/dom-helpers.ts`
- Modify: `tests/content-script/dom-helpers.test.ts`

Context: `translateText` casts the response as `Array<unknown>` with no runtime check. If Google changes the undocumented API format, the function currently throws an unreadable type error. A shape guard throws a clear message that the caller can display.

- [ ] **Step 1: Read the current test file to understand its structure**

Open `tests/content-script/dom-helpers.test.ts` to see what's already there before adding tests.

- [ ] **Step 2: Write failing test**

Add to `tests/content-script/dom-helpers.test.ts`:

```ts
describe('translateText', () => {
  it('throws on unexpected response shape (not nested array)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'object' }),
    }) as unknown as typeof fetch

    const { translateText } = await import('../../src/content-script/dom-helpers')
    await expect(translateText('hello', 'es')).rejects.toThrow('Unexpected translation response shape')
  })

  it('returns joined translated string on valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Hola', 'hello', null, null, null]], null, 'en'],
    }) as unknown as typeof fetch

    const { translateText } = await import('../../src/content-script/dom-helpers')
    const result = await translateText('hello', 'es')
    expect(result).toBe('Hola')
  })
})
```

- [ ] **Step 3: Run tests to verify first one fails**

```bash
rtk vitest run tests/content-script/dom-helpers.test.ts
```

Expected: "throws on unexpected shape" FAIL (no guard exists yet), "returns joined string" PASS.

- [ ] **Step 4: Add shape guard to `src/content-script/dom-helpers.ts`**

Replace the `translateText` function:

```ts
export async function translateText(text: string, targetLang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${resp.status}`)
  const data = await resp.json() as Array<unknown>
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected translation response shape')
  }
  return (data[0] as Array<[string]>).map(chunk => chunk[0]).join('')
}
```

- [ ] **Step 5: Run all tests**

```bash
rtk vitest run
```

Expected: 75 tests passing.

- [ ] **Step 6: Commit**

```bash
rtk git add src/content-script/dom-helpers.ts tests/content-script/dom-helpers.test.ts
rtk git commit -m "security: add runtime shape guard to translateText"
```

---

## Task 9: Error Message Mapping Module

**Files:**
- Create: `src/content-script/error-map.ts`
- Modify: `src/i18n.ts`
- Modify: `src/content-script/auth-modal.ts`
- Modify: `src/content-script/recipe-page/review-form.ts`
- Create: `tests/content-script/error-map.test.ts`

Context: Raw Supabase errors are currently shown to users (e.g., `"duplicate key value violates unique constraint \"users_username_key\""`). This leaks DB internals and is confusing. A mapper converts known constraint names to friendly i18n strings and logs the raw error to console.

- [ ] **Step 1: Add new i18n keys to `src/i18n.ts`**

The `translations` object uses `satisfies Record<Lang, Record<string, string>>`, which means TypeScript will error if any language is missing a key. Add all 4 keys to all 4 language blocks.

In the `en` block, add after the `translating` line:
```ts
    errUsernameTaken: 'Username is already taken',
    errEmailRateLimit: 'Too many attempts, please wait a few minutes',
    errInputTooLong: 'Input exceeds maximum length',
    errGeneric: 'Something went wrong, please try again',
```

In the `es` block, add:
```ts
    errUsernameTaken: 'El nombre de usuario ya está en uso',
    errEmailRateLimit: 'Demasiados intentos, espera unos minutos',
    errInputTooLong: 'El texto supera la longitud máxima',
    errGeneric: 'Algo salió mal, inténtalo de nuevo',
```

In the `pt` block, add:
```ts
    errUsernameTaken: 'Nome de utilizador já em uso',
    errEmailRateLimit: 'Demasiadas tentativas, aguarda alguns minutos',
    errInputTooLong: 'O texto excede o comprimento máximo',
    errGeneric: 'Algo correu mal, tenta novamente',
```

In the `it` block, add:
```ts
    errUsernameTaken: 'Nome utente già in uso',
    errEmailRateLimit: 'Troppi tentativi, attendi qualche minuto',
    errInputTooLong: 'Il testo supera la lunghezza massima',
    errGeneric: 'Qualcosa è andato storto, riprova',
```

- [ ] **Step 2: Write failing tests for the error mapper**

Create `tests/content-script/error-map.test.ts`:

```ts
import { vi, describe, it, expect } from 'vitest'

vi.mock('../../src/i18n', () => ({ t: (key: string) => key }))

describe('friendlyError', () => {
  it('maps username uniqueness constraint to errUsernameTaken', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('duplicate key value violates unique constraint "users_username_key"'))
      .toBe('errUsernameTaken')
  })

  it('maps username format constraint to errInputTooLong', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('new row violates check constraint "users_username_check"'))
      .toBe('errInputTooLong')
  })

  it('maps body length constraint to errInputTooLong', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('new row violates check constraint "reviews_body_length_check"'))
      .toBe('errInputTooLong')
  })

  it('maps email rate limit to errEmailRateLimit', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('Email rate limit exceeded'))
      .toBe('errEmailRateLimit')
  })

  it('maps unknown errors to errGeneric', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('some internal postgres error'))
      .toBe('errGeneric')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
rtk vitest run tests/content-script/error-map.test.ts
```

Expected: 5 tests FAIL — module does not exist yet.

- [ ] **Step 4: Create `src/content-script/error-map.ts`**

```ts
import { t } from '../i18n'

export function friendlyError(raw: string): string {
  console.error('[Mixers Club] Supabase error:', raw)
  if (raw.includes('users_username_key'))          return t('errUsernameTaken')
  if (raw.includes('users_username_check'))         return t('errInputTooLong')
  if (raw.includes('reviews_body_length_check'))    return t('errInputTooLong')
  if (raw.includes('Email rate limit exceeded'))    return t('errEmailRateLimit')
  return t('errGeneric')
}
```

- [ ] **Step 5: Run error-map tests to verify they pass**

```bash
rtk vitest run tests/content-script/error-map.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 6: Update `src/content-script/auth-modal.ts` to use `friendlyError`**

Add import at the top of the file:
```ts
import { friendlyError } from './error-map'
```

Find all occurrences of the raw error display pattern and replace them. There are two:

```ts
// In showLogin (around line 125):
// BEFORE:
        errorEl.textContent = `Error: ${result.error}`
// AFTER:
        errorEl.textContent = friendlyError(result.error ?? '')

// In showUsernameForm (around line 193):
// BEFORE:
        errorEl.textContent = `Error: ${result.error}`
// AFTER:
        errorEl.textContent = friendlyError(result.error ?? '')
```

- [ ] **Step 7: Update `src/content-script/recipe-page/review-form.ts` to use `friendlyError`**

Add import at the top:
```ts
import { friendlyError } from '../error-map'
```

Find the raw error display (around line 130):
```ts
// BEFORE:
      errorEl.textContent = `Error: ${result.error}`
// AFTER:
      errorEl.textContent = friendlyError(result.error ?? '')
```

- [ ] **Step 8: Run typecheck and all tests**

```bash
pnpm run typecheck && rtk vitest run
```

Expected: no type errors, 80 tests passing (75 + 5 new).

- [ ] **Step 9: Commit**

```bash
rtk git add src/content-script/error-map.ts src/i18n.ts src/content-script/auth-modal.ts src/content-script/recipe-page/review-form.ts tests/content-script/error-map.test.ts
rtk git commit -m "security: add friendly error mapper, 4 i18n keys, use in auth modal and review form"
```

---

## Task 10: Cleanup

**Files:**
- Modify: `package.json` (+ `pnpm-lock.yaml`)
- Modify: `public/manifest.json`

- [ ] **Step 1: Remove stale devDependency**

```bash
pnpm remove -D @types/blueimp-md5
```

- [ ] **Step 2: Verify the package is gone**

```bash
rtk pnpm list @types/blueimp-md5
```

Expected: package not found / empty output.

- [ ] **Step 3: Scope `auth-callback.html` in `public/manifest.json`**

Find the `web_accessible_resources` block and replace it:

```json
"web_accessible_resources": [{
  "resources": ["auth-callback.html"],
  "matches": ["https://*.supabase.co/*"]
}]
```

- [ ] **Step 4: Run all tests**

```bash
rtk vitest run
```

Expected: 80 tests passing.

- [ ] **Step 5: Commit**

```bash
rtk git add package.json pnpm-lock.yaml public/manifest.json
rtk git commit -m "chore: remove @types/blueimp-md5, scope auth-callback to supabase domain"
```

---

## Final Verification

- [ ] Run `pnpm run typecheck` — no errors
- [ ] Run `rtk vitest run` — 80 tests passing
- [ ] Run `pnpm run build` — clean build, no warnings
- [ ] Load the built extension in Chrome (`chrome://extensions` → Load unpacked → `dist/`) and verify:
  - Cookidoo recipe page loads the reviews section
  - Login flow works (magic link → username → signed in)
  - Username too long shows "Username must be 30 characters or fewer"
  - Review body counter appears below textarea
  - Translate button still works on non-English reviews
