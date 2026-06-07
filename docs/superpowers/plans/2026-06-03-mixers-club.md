# Mixers Club Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that injects community reviews and trending recipes into Cookidoo pages, backed by Supabase auth and PostgreSQL.

**Architecture:** Content script handles DOM injection only, communicating with a background service worker via `chrome.runtime.sendMessage`. The service worker owns the Supabase client (anon key only) and all data/auth calls. RLS on the database enforces all access control — no management-power secrets live in the extension.

**Tech Stack:** TypeScript, Vite (multi-entry build), @supabase/supabase-js, blueimp-md5, vitest + jsdom, Supabase MCP server for schema/auth management.

---

## File Map

```
public/
  manifest.json
  popup.html
  auth-callback.html

src/
  types.ts                              ← all shared Message + data types
  service-worker/
    index.ts                            ← message router (onMessage listener)
    supabase.ts                         ← Supabase client init (anon key only)
    auth.ts                             ← sendMagicLink, authCallback, signOut, getSession
    api.ts                              ← getReviews, addReview, vote, getTrending
  content-script/
    index.ts                            ← entry: detectPage, dispatch to recipe/home
    page-detector.ts                    ← detectPage(), extractRecipeId() — pure URL logic
    dom-helpers.ts                      ← waitForElement(), gravatarUrl()
    recipe-page/
      index.ts                          ← orchestrates recipe page injection
      reviews-section.ts               ← builds reviews carousel HTML + filter chips
      star-watcher.ts                   ← clones core-rating, watches Cookidoo's real rating
      review-form.ts                    ← inline form: type selector, star clone, textarea
    home-page/
      index.ts                          ← orchestrates home page injection
      trending-section.ts              ← builds trending section HTML
  popup/
    index.ts                            ← login/logout/username UI
  auth-callback/
    index.ts                            ← extracts token, sends to service worker

tests/
  content-script/
    page-detector.test.ts
    dom-helpers.test.ts
    recipe-page/
      reviews-section.test.ts
      star-watcher.test.ts
      review-form.test.ts
    home-page/
      trending-section.test.ts
  service-worker/
    auth.test.ts
    api.test.ts

vite.config.ts
tsconfig.json
vitest.config.ts
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `public/manifest.json`
- Create: `public/popup.html`
- Create: `public/auth-callback.html`
- Create: `src/types.ts` (empty)

- [ ] **Step 1: Init npm project**

```bash
cd C:\dev\mixers_club
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js blueimp-md5
npm install -D typescript vite vitest jsdom @vitest/coverage-v8 @types/chrome @types/blueimp-md5
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*", "tests/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write vite.config.ts**

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
        'content-script': resolve(__dirname, 'src/content-script/index.ts'),
        'popup': resolve(__dirname, 'src/popup/index.ts'),
        'auth-callback': resolve(__dirname, 'src/auth-callback/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        format: 'es',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
  },
})
```

- [ ] **Step 5: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
  },
})
```

- [ ] **Step 6: Write tests/setup.ts** (chrome API mock foundation)

```ts
// Global chrome mock — individual tests override as needed
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
}

vi.stubGlobal('chrome', chromeMock)
```

- [ ] **Step 7: Write public/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Mixers Club",
  "version": "0.1.0",
  "description": "Community reviews and trending recipes for Cookidoo",
  "permissions": ["storage"],
  "host_permissions": ["*://*.cookidoo.*/*"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["*://*.cookidoo.*/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Mixers Club"
  },
  "web_accessible_resources": [{
    "resources": ["auth-callback.html"],
    "matches": ["<all_urls>"]
  }]
}
```

- [ ] **Step 8: Write public/popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mixers Club</title>
  <style>
    body { width: 280px; padding: 16px; font-family: sans-serif; margin: 0; }
    input { width: 100%; box-sizing: border-box; padding: 8px; margin: 8px 0; }
    button { width: 100%; padding: 8px; cursor: pointer; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/popup.js"></script>
</body>
</html>
```

- [ ] **Step 9: Write public/auth-callback.html**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mixers Club Auth</title></head>
<body>
  <p>Completing sign in…</p>
  <script type="module" src="/auth-callback.js"></script>
</body>
</html>
```

- [ ] **Step 10: Create empty src/types.ts placeholder and stub entry files**

```ts
// src/types.ts — filled in Task 3
export {}
```

Create empty stubs so Vite can resolve all entries:
- `src/service-worker/index.ts` → `export {}`
- `src/content-script/index.ts` → `export {}`
- `src/popup/index.ts` → `export {}`
- `src/auth-callback/index.ts` → `export {}`

- [ ] **Step 11: Verify build succeeds**

```bash
npx vite build
```

Expected: `dist/` created with `service-worker.js`, `content-script.js`, `popup.js`, `auth-callback.js`, and the public files copied.

- [ ] **Step 12: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold project — Vite multi-entry build, manifest.json, tsconfig"
```

---

## Task 2: Supabase setup

**Uses:** Supabase MCP server tools. Apply migrations in order. Note the project URL and anon key for Task 4.

- [ ] **Step 1: Create Supabase project (or select existing)**

Use `mcp__plugin_supabase_supabase__list_projects` to check for an existing project, or `mcp__plugin_supabase_supabase__create_project` to create one named `mixers-club`.

- [ ] **Step 2: Apply schema migration — tables**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `create_tables`:

```sql
CREATE TABLE public.recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cookidoo_id text NOT NULL,
  domain      text NOT NULL,
  name        text,
  UNIQUE (cookidoo_id, domain)
);

CREATE TABLE public.users (
  id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  email    text NOT NULL
);

CREATE TABLE public.reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('improvement','variation','comment','warning','other')),
  body       text NOT NULL,
  stars      integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.votes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  value     integer NOT NULL CHECK (value IN (1, -1)),
  UNIQUE (review_id, user_id)
);
```

- [ ] **Step 3: Apply migration — RLS policies**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `enable_rls`:

```sql
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes   ENABLE ROW LEVEL SECURITY;

-- recipes: public read, authenticated insert/upsert
CREATE POLICY "recipes_select" ON public.recipes FOR SELECT USING (true);
CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE USING (auth.uid() IS NOT NULL);

-- users: public read, own record insert/update
CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- reviews: public read, own record insert
CREATE POLICY "reviews_select" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- votes: authenticated read, own record upsert
CREATE POLICY "votes_select" ON public.votes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "votes_insert" ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_update" ON public.votes FOR UPDATE USING (auth.uid() = user_id);
```

- [ ] **Step 4: Apply migration — database functions**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `create_functions`:

```sql
-- Returns reviews with aggregated vote counts and caller's own vote
CREATE OR REPLACE FUNCTION get_reviews_for_recipe(p_cookidoo_id text, p_domain text)
RETURNS TABLE (
  id         uuid,
  recipe_id  uuid,
  user_id    uuid,
  type       text,
  body       text,
  stars      integer,
  created_at timestamptz,
  username   text,
  email      text,
  likes      bigint,
  dislikes   bigint,
  user_vote  integer
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    rv.id, rv.recipe_id, rv.user_id, rv.type, rv.body, rv.stars, rv.created_at,
    u.username, u.email,
    COALESCE(SUM(CASE WHEN v.value =  1 THEN 1 ELSE 0 END), 0) AS likes,
    COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes,
    MAX(CASE WHEN v.user_id = auth.uid() THEN v.value END)::integer AS user_vote
  FROM reviews rv
  JOIN recipes r ON rv.recipe_id = r.id
  JOIN users   u ON rv.user_id   = u.id
  LEFT JOIN votes v ON v.review_id = rv.id
  WHERE r.cookidoo_id = p_cookidoo_id AND r.domain = p_domain
  GROUP BY rv.id, rv.recipe_id, rv.user_id, rv.type, rv.body, rv.stars, rv.created_at,
           u.username, u.email
  ORDER BY (COALESCE(SUM(CASE WHEN v.value=1 THEN 1 ELSE 0 END),0) -
            COALESCE(SUM(CASE WHEN v.value=-1 THEN 1 ELSE 0 END),0)) DESC;
$$;

-- Returns trending recipes this calendar month
CREATE OR REPLACE FUNCTION get_trending_recipes(p_limit integer DEFAULT 10)
RETURNS TABLE (
  cookidoo_id  text,
  domain       text,
  name         text,
  avg_stars    numeric,
  review_count bigint,
  score        numeric
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    r.cookidoo_id,
    r.domain,
    r.name,
    ROUND(AVG(rv.stars)::numeric, 1) AS avg_stars,
    COUNT(rv.id)                     AS review_count,
    AVG(rv.stars) * LN(1 + COUNT(rv.id)) AS score
  FROM reviews rv
  JOIN recipes r ON rv.recipe_id = r.id
  WHERE rv.created_at >= date_trunc('month', now())
  GROUP BY r.id, r.cookidoo_id, r.domain, r.name
  ORDER BY score DESC
  LIMIT p_limit;
$$;
```

- [ ] **Step 5: Configure Auth — enable magic link, set redirect URL**

Use `mcp__plugin_supabase_supabase__get_project` to confirm project is active.

In Supabase dashboard → Auth → URL Configuration:
- Site URL: `chrome-extension://<YOUR_EXTENSION_ID>`
- Redirect URLs (allowed list): `chrome-extension://<YOUR_EXTENSION_ID>/auth-callback.html`

To get a stable extension ID during development, add a `key` field to `public/manifest.json`. Generate it by running:
```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A
```
Paste the base64 output as the `"key"` field in manifest.json. The extension ID is then derived deterministically from this key.

- [ ] **Step 6: Retrieve anon key and project URL**

Use `mcp__plugin_supabase_supabase__get_project_url` and `mcp__plugin_supabase_supabase__get_publishable_keys` to retrieve:
- `SUPABASE_URL` (e.g. `https://xxxx.supabase.co`)
- `SUPABASE_ANON_KEY`

Create `.env` (git-ignored):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Add `.env` to `.gitignore`.

- [ ] **Step 7: Verify tables via MCP**

Use `mcp__plugin_supabase_supabase__list_tables` to confirm all 4 tables exist.

- [ ] **Step 8: Commit**

```bash
git add public/manifest.json .gitignore
git commit -m "feat: add stable extension key to manifest"
```

---

## Task 3: Shared types

**Files:**
- Modify: `src/types.ts`
- Test: `tests/types.test.ts` (type-level only, no runtime assertions needed)

- [ ] **Step 1: Write src/types.ts**

```ts
export type ReviewType = 'improvement' | 'variation' | 'comment' | 'warning' | 'other'

export interface Review {
  id: string
  recipe_id: string
  user_id: string
  type: ReviewType
  body: string
  stars: number
  created_at: string
  username: string
  email: string
  likes: number
  dislikes: number
  user_vote: 1 | -1 | null
}

export interface TrendingRecipe {
  cookidoo_id: string
  domain: string
  name: string | null
  avg_stars: number
  review_count: number
  score: number
}

// All messages from content script to service worker
export type Message =
  | { action: 'sendMagicLink'; email: string }
  | { action: 'authCallback'; token: string }
  | { action: 'getSession' }
  | { action: 'signOut' }
  | { action: 'getReviews'; cookidooId: string; domain: string }
  | { action: 'addReview'; cookidooId: string; domain: string; recipeName: string; type: ReviewType; stars: number; body: string }
  | { action: 'vote'; reviewId: string; value: 1 | -1 }
  | { action: 'getTrending' }
  | { action: 'setUsername'; username: string }

export interface Session {
  userId: string
  username: string | null
  email: string
  accessToken: string
  refreshToken: string
}

export type MessageResponse<T = void> =
  | { data: T; error: null }
  | { data: null; error: string }
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for messages, reviews, and sessions"
```

---

## Task 4: Service worker — Supabase client + message router

**Files:**
- Create: `src/service-worker/supabase.ts`
- Create: `src/service-worker/index.ts`
- Test: `tests/service-worker/router.test.ts`

- [ ] **Step 1: Write failing test for message router**

```ts
// tests/service-worker/router.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('service worker message router', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns error for unknown action', async () => {
    const { handleMessage } = await import('../../src/service-worker/index')
    const result = await handleMessage({ action: 'unknownAction' } as any)
    expect(result.error).toMatch(/unknown action/i)
  })

  it('routes getSession action', async () => {
    vi.mock('../../src/service-worker/auth', () => ({
      handleGetSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    }))
    const { handleMessage } = await import('../../src/service-worker/index')
    const result = await handleMessage({ action: 'getSession' })
    expect(result).toEqual({ data: null, error: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/service-worker/router.test.ts
```

Expected: FAIL — module not found or handleMessage not exported.

- [ ] **Step 3: Write src/service-worker/supabase.ts**

```ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[Mixers Club] Missing Supabase env vars. Check .env file.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => chrome.storage.local.get(key).then(r => r[key] ?? null),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 4: Write src/service-worker/index.ts**

```ts
import type { Message, MessageResponse } from '../types'
import { handleSendMagicLink, handleAuthCallback, handleGetSession, handleSignOut, handleSetUsername } from './auth'
import { handleGetReviews, handleAddReview, handleVote, handleGetTrending } from './api'

export async function handleMessage(message: Message): Promise<MessageResponse<unknown>> {
  try {
    switch (message.action) {
      case 'sendMagicLink':  return handleSendMagicLink(message.email)
      case 'authCallback':   return handleAuthCallback(message.token)
      case 'getSession':     return handleGetSession()
      case 'signOut':        return handleSignOut()
      case 'setUsername':    return handleSetUsername(message.username)
      case 'getReviews':     return handleGetReviews(message.cookidooId, message.domain)
      case 'addReview':      return handleAddReview(message)
      case 'vote':           return handleVote(message.reviewId, message.value)
      case 'getTrending':    return handleGetTrending()
      default: {
        const exhaustive: never = message
        return { data: null, error: `Unknown action: ${(exhaustive as Message).action}` }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Mixers Club SW]', msg)
    return { data: null, error: msg }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as Message).then(sendResponse)
  return true // keep channel open for async
})
```

Create stub files so TypeScript resolves imports:

`src/service-worker/auth.ts`:
```ts
import type { MessageResponse, Session } from '../types'
export async function handleSendMagicLink(_email: string): Promise<MessageResponse> { return { data: null, error: null } }
export async function handleAuthCallback(_token: string): Promise<MessageResponse> { return { data: null, error: null } }
export async function handleGetSession(): Promise<MessageResponse<Session | null>> { return { data: null, error: null } }
export async function handleSignOut(): Promise<MessageResponse> { return { data: null, error: null } }
export async function handleSetUsername(_username: string): Promise<MessageResponse> { return { data: null, error: null } }
```

`src/service-worker/api.ts`:
```ts
import type { Message, MessageResponse, Review, TrendingRecipe } from '../types'
export async function handleGetReviews(_id: string, _domain: string): Promise<MessageResponse<Review[]>> { return { data: [], error: null } }
export async function handleAddReview(_msg: Extract<Message, { action: 'addReview' }>): Promise<MessageResponse<Review>> { return { data: null, error: 'not implemented' } }
export async function handleVote(_reviewId: string, _value: 1 | -1): Promise<MessageResponse> { return { data: null, error: null } }
export async function handleGetTrending(): Promise<MessageResponse<TrendingRecipe[]>> { return { data: [], error: null } }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/service-worker/router.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/service-worker/
git commit -m "feat: service worker message router with typed actions"
```

---

## Task 5: Service worker — Auth handlers

**Files:**
- Modify: `src/service-worker/auth.ts`
- Test: `tests/service-worker/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/service-worker/auth.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockSignInWithOtp = vi.fn()
const mockSetSession = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../src/service-worker/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      setSession: mockSetSession,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
    from: mockFrom,
  },
}))

describe('handleSendMagicLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls supabase signInWithOtp with the email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    const { handleSendMagicLink } = await import('../../src/service-worker/auth')
    const result = await handleSendMagicLink('test@example.com')
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: expect.objectContaining({ shouldCreateUser: true }),
    })
    expect(result.error).toBeNull()
  })

  it('returns error when supabase fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'rate limited' } })
    const { handleSendMagicLink } = await import('../../src/service-worker/auth')
    const result = await handleSendMagicLink('test@example.com')
    expect(result.error).toBe('rate limited')
  })
})

describe('handleGetSession', () => {
  it('returns null when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    const { handleGetSession } = await import('../../src/service-worker/auth')
    const result = await handleGetSession()
    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })

  it('returns session data when authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'uid-1', email: 'a@b.com' },
          access_token: 'tok',
          refresh_token: 'ref',
        },
      },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { username: 'chef99' }, error: null }),
    })
    const { handleGetSession } = await import('../../src/service-worker/auth')
    const result = await handleGetSession()
    expect(result.data?.userId).toBe('uid-1')
    expect(result.data?.username).toBe('chef99')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/service-worker/auth.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/service-worker/auth.ts**

```ts
import type { Message, MessageResponse, Session } from '../types'
import { supabase } from './supabase'

export async function handleSendMagicLink(email: string): Promise<MessageResponse> {
  const redirectTo = `chrome-extension://${chrome.runtime.id}/auth-callback.html`
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  })
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

export async function handleAuthCallback(token: string): Promise<MessageResponse> {
  // token is the full hash string: "access_token=...&refresh_token=...&..."
  const params = new URLSearchParams(token)
  const access_token = params.get('access_token') ?? ''
  const refresh_token = params.get('refresh_token') ?? ''
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

export async function handleGetSession(): Promise<MessageResponse<Session | null>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return { data: null, error: error.message }
  if (!data.session) return { data: null, error: null }

  const { user, access_token, refresh_token } = data.session
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
      accessToken: access_token,
      refreshToken: refresh_token,
    },
    error: null,
  }
}

export async function handleSignOut(): Promise<MessageResponse> {
  const { error } = await supabase.auth.signOut()
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

export async function handleSetUsername(username: string): Promise<MessageResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'Not authenticated' }

  const { error } = await supabase.from('users').upsert({
    id: session.user.id,
    username: username.trim(),
    email: session.user.email ?? '',
  })
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/service-worker/auth.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service-worker/auth.ts tests/service-worker/auth.test.ts
git commit -m "feat: auth handlers — magic link, session, signOut, setUsername"
```

---

## Task 6: Service worker — API handlers

**Files:**
- Modify: `src/service-worker/api.ts`
- Test: `tests/service-worker/api.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/service-worker/api.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../src/service-worker/supabase', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}))

describe('handleGetReviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls get_reviews_for_recipe rpc with correct params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    await handleGetReviews('r268795', 'cookidoo.co.uk')
    expect(mockRpc).toHaveBeenCalledWith('get_reviews_for_recipe', {
      p_cookidoo_id: 'r268795',
      p_domain: 'cookidoo.co.uk',
    })
  })

  it('filters out hidden reviews (net_score < -3 AND dislike_ratio > 0.5)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: '1', likes: 0, dislikes: 5, stars: 3, type: 'comment', body: 'bad', username: 'a', email: 'a@b.com', created_at: '', recipe_id: '', user_id: '', user_vote: null },
        { id: '2', likes: 10, dislikes: 1, stars: 5, type: 'comment', body: 'good', username: 'b', email: 'b@c.com', created_at: '', recipe_id: '', user_id: '', user_vote: null },
      ],
      error: null,
    })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    const result = await handleGetReviews('r123', 'cookidoo.es')
    expect(result.data).toHaveLength(1)
    expect(result.data![0]!.id).toBe('2')
  })
})

describe('handleGetTrending', () => {
  it('calls get_trending_recipes rpc', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { handleGetTrending } = await import('../../src/service-worker/api')
    await handleGetTrending()
    expect(mockRpc).toHaveBeenCalledWith('get_trending_recipes', { p_limit: 10 })
  })
})

describe('handleVote', () => {
  it('upserts vote row', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    const { handleVote } = await import('../../src/service-worker/api')
    await handleVote('review-uuid', 1)
    expect(mockFrom).toHaveBeenCalledWith('votes')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ review_id: 'review-uuid', value: 1 }),
      expect.objectContaining({ onConflict: 'review_id,user_id' })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/service-worker/api.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/service-worker/api.ts**

```ts
import type { Message, MessageResponse, Review, TrendingRecipe } from '../types'
import { supabase } from './supabase'

function isHidden(review: Review): boolean {
  const netScore = review.likes - review.dislikes
  const total = review.likes + review.dislikes
  const dislikeRatio = total > 0 ? review.dislikes / total : 0
  return netScore < -3 && dislikeRatio > 0.5
}

export async function handleGetReviews(cookidooId: string, domain: string): Promise<MessageResponse<Review[]>> {
  const { data, error } = await supabase.rpc('get_reviews_for_recipe', {
    p_cookidoo_id: cookidooId,
    p_domain: domain,
  })
  if (error) return { data: null, error: error.message }
  const visible = (data as Review[]).filter(r => !isHidden(r))
  return { data: visible, error: null }
}

export async function handleAddReview(
  msg: Extract<Message, { action: 'addReview' }>
): Promise<MessageResponse<Review>> {
  // Upsert recipe row
  const { data: recipe, error: recipeErr } = await supabase
    .from('recipes')
    .upsert(
      { cookidoo_id: msg.cookidooId, domain: msg.domain, name: msg.recipeName },
      { onConflict: 'cookidoo_id,domain' }
    )
    .select('id')
    .single()
  if (recipeErr) return { data: null, error: recipeErr.message }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'Not authenticated' }

  const { data: review, error: reviewErr } = await supabase
    .from('reviews')
    .insert({
      recipe_id: recipe.id,
      user_id: session.user.id,
      type: msg.type,
      body: msg.body,
      stars: msg.stars,
    })
    .select('id, recipe_id, user_id, type, body, stars, created_at')
    .single()
  if (reviewErr) return { data: null, error: reviewErr.message }

  // Fetch username + email for immediate card rendering
  const { data: profile } = await supabase
    .from('users')
    .select('username, email')
    .eq('id', session.user.id)
    .single()

  return {
    data: {
      ...review,
      username: profile?.username ?? '',
      email: profile?.email ?? '',
      likes: 0,
      dislikes: 0,
      user_vote: null,
    } as Review,
    error: null,
  }
}

export async function handleVote(reviewId: string, value: 1 | -1): Promise<MessageResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'Not authenticated' }

  const { error } = await supabase
    .from('votes')
    .upsert(
      { review_id: reviewId, user_id: session.user.id, value },
      { onConflict: 'review_id,user_id' }
    )
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

export async function handleGetTrending(): Promise<MessageResponse<TrendingRecipe[]>> {
  const { data, error } = await supabase.rpc('get_trending_recipes', { p_limit: 10 })
  if (error) return { data: null, error: error.message }
  return { data: data as TrendingRecipe[], error: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/service-worker/api.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service-worker/api.ts tests/service-worker/api.test.ts
git commit -m "feat: API handlers — getReviews (with hide filter), addReview, vote, getTrending"
```

---

## Task 7: Auth callback page

**Files:**
- Create: `src/auth-callback/index.ts`

No unit test needed — this is a one-liner bridge page. Verified manually by completing a magic link flow.

- [ ] **Step 1: Implement src/auth-callback/index.ts**

```ts
// Extracts the token hash from the URL and passes it to the service worker.
// Supabase appends auth params as a URL hash: #access_token=...&refresh_token=...
const hash = window.location.hash.slice(1) // remove leading '#'

if (hash) {
  chrome.runtime.sendMessage({ action: 'authCallback', token: hash }, () => {
    // Close this tab once the service worker has handled the token
    window.close()
  })
} else {
  document.body.textContent = 'Auth failed: no token in URL.'
}
```

- [ ] **Step 2: Build and verify it compiles**

```bash
npx vite build
```

Expected: `dist/auth-callback.js` created without errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth-callback/index.ts
git commit -m "feat: auth callback page — extracts token hash and sends to service worker"
```

---

## Task 8: Popup UI

**Files:**
- Create: `src/popup/index.ts`

- [ ] **Step 1: Implement src/popup/index.ts**

```ts
import type { Message, Session } from '../types'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

function render(session: Session | null) {
  const app = document.getElementById('app')!

  if (!session) {
    app.innerHTML = `
      <h3 style="margin:0 0 12px">Mixers Club</h3>
      <p id="mc-status"></p>
      <input id="mc-email" type="email" placeholder="your@email.com" />
      <button id="mc-send">Send magic link</button>
    `
    document.getElementById('mc-send')!.addEventListener('click', async () => {
      const email = (document.getElementById('mc-email') as HTMLInputElement).value.trim()
      if (!email) return
      const status = document.getElementById('mc-status')!
      status.textContent = 'Sending…'
      const result = await send({ action: 'sendMagicLink', email })
      status.textContent = result.error ? `Error: ${result.error}` : 'Check your email for the link!'
    })
    return
  }

  if (!session.username) {
    app.innerHTML = `
      <h3 style="margin:0 0 12px">Choose a username</h3>
      <p id="mc-status"></p>
      <input id="mc-username" type="text" placeholder="e.g. chef_rodriguez" />
      <button id="mc-save">Save</button>
    `
    document.getElementById('mc-save')!.addEventListener('click', async () => {
      const username = (document.getElementById('mc-username') as HTMLInputElement).value.trim()
      if (!username) return
      const status = document.getElementById('mc-status')!
      status.textContent = 'Saving…'
      const result = await send({ action: 'setUsername', username })
      if (result.error) { status.textContent = `Error: ${result.error}`; return }
      const refreshed = await send<Session>({ action: 'getSession' })
      render(refreshed.data)
    })
    return
  }

  app.innerHTML = `
    <h3 style="margin:0 0 8px">Mixers Club</h3>
    <p>Signed in as <strong>${session.username}</strong></p>
    <button id="mc-logout">Sign out</button>
  `
  document.getElementById('mc-logout')!.addEventListener('click', async () => {
    await send({ action: 'signOut' })
    render(null)
  })
}

async function init() {
  const result = await send<Session>({ action: 'getSession' })
  render(result.data)
}

init()
```

- [ ] **Step 2: Build and verify**

```bash
npx vite build
```

Expected: `dist/popup.js` created without errors.

- [ ] **Step 3: Commit**

```bash
git add src/popup/index.ts
git commit -m "feat: popup UI — magic link login, username setup, logout"
```

---

## Task 9: Content script — foundation

**Files:**
- Create: `src/content-script/page-detector.ts`
- Create: `src/content-script/dom-helpers.ts`
- Modify: `src/content-script/index.ts`
- Test: `tests/content-script/page-detector.test.ts`
- Test: `tests/content-script/dom-helpers.test.ts`

- [ ] **Step 1: Write failing tests for page-detector**

```ts
// tests/content-script/page-detector.test.ts
import { describe, it, expect } from 'vitest'
import { detectPage, extractRecipeId } from '../../src/content-script/page-detector'

describe('detectPage', () => {
  it('detects recipe pages', () => {
    expect(detectPage('/recipes/recipe/en-GB/r268795')).toBe('recipe')
    expect(detectPage('/recipes/recipe/es-ES/r12345')).toBe('recipe')
  })

  it('detects home pages', () => {
    expect(detectPage('/foundation/en-GB/for-you')).toBe('home')
    expect(detectPage('/foundation/de-DE/for-you')).toBe('home')
  })

  it('returns other for unrecognised paths', () => {
    expect(detectPage('/search/en-GB')).toBe('other')
    expect(detectPage('/foundation/en-GB/explore')).toBe('other')
    expect(detectPage('/')).toBe('other')
  })
})

describe('extractRecipeId', () => {
  it('extracts the recipe ID from a recipe URL', () => {
    expect(extractRecipeId('/recipes/recipe/en-GB/r268795')).toBe('r268795')
  })

  it('returns null for non-recipe URLs', () => {
    expect(extractRecipeId('/search/en-GB')).toBeNull()
  })
})
```

- [ ] **Step 2: Write failing tests for dom-helpers**

```ts
// tests/content-script/dom-helpers.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { waitForElement, gravatarUrl } from '../../src/content-script/dom-helpers'

describe('waitForElement', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('resolves immediately if element already exists', async () => {
    document.body.innerHTML = '<div id="target"></div>'
    const el = await waitForElement('#target')
    expect(el).toBeTruthy()
    expect(el.id).toBe('target')
  })

  it('resolves when element is added to DOM', async () => {
    const promise = waitForElement('#late', 2000)
    setTimeout(() => {
      document.body.innerHTML = '<div id="late"></div>'
    }, 50)
    const el = await promise
    expect(el.id).toBe('late')
  })

  it('rejects and logs error after timeout', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(waitForElement('#never', 100)).rejects.toThrow('Element not found')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Mixers Club]'),
      expect.stringContaining('#never')
    )
    errorSpy.mockRestore()
  })
})

describe('gravatarUrl', () => {
  it('returns a gravatar URL with identicon fallback', () => {
    const url = gravatarUrl('Test@Example.com', 48)
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?d=identicon&s=48$/)
  })

  it('is case-insensitive and trims whitespace', () => {
    const a = gravatarUrl('TEST@EXAMPLE.COM', 48)
    const b = gravatarUrl('  test@example.com  ', 48)
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/content-script/page-detector.test.ts tests/content-script/dom-helpers.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement src/content-script/page-detector.ts**

```ts
export type PageType = 'recipe' | 'home' | 'other'

export function detectPage(pathname: string): PageType {
  if (/\/recipes\/recipe\/[^/]+\/r\w+/.test(pathname)) return 'recipe'
  if (/\/foundation\/[^/]+\/for-you$/.test(pathname)) return 'home'
  return 'other'
}

export function extractRecipeId(pathname: string): string | null {
  return pathname.match(/\/recipes\/recipe\/[^/]+\/(r\w+)/)?.[1] ?? null
}
```

- [ ] **Step 5: Implement src/content-script/dom-helpers.ts**

```ts
import md5 from 'blueimp-md5'

export function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) { resolve(existing); return }

    const timer = setTimeout(() => {
      observer.disconnect()
      const msg = `Element not found: ${selector}`
      console.error(`[Mixers Club] ${msg} on ${window.location.hostname}${window.location.pathname}`)
      reject(new Error(msg))
    }, timeout)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function gravatarUrl(email: string, size = 48): string {
  const hash = md5(email.trim().toLowerCase())
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/content-script/page-detector.test.ts tests/content-script/dom-helpers.test.ts
```

Expected: PASS

- [ ] **Step 7: Implement src/content-script/index.ts**

```ts
import { detectPage, extractRecipeId } from './page-detector'
import { initRecipePage } from './recipe-page/index'
import { initHomePage } from './home-page/index'

const pageType = detectPage(window.location.pathname)

if (pageType === 'recipe') {
  const recipeId = extractRecipeId(window.location.pathname)
  if (recipeId) initRecipePage(recipeId, window.location.hostname)
} else if (pageType === 'home') {
  initHomePage(window.location.hostname)
}
```

Create stubs for the imports so it compiles:

`src/content-script/recipe-page/index.ts`:
```ts
export function initRecipePage(_recipeId: string, _domain: string): void {}
```

`src/content-script/home-page/index.ts`:
```ts
export function initHomePage(_domain: string): void {}
```

- [ ] **Step 8: Commit**

```bash
git add src/content-script/ tests/content-script/
git commit -m "feat: content script foundation — page detector, DOM helpers, entry point"
```

---

## Task 10: Recipe page — reviews carousel

**Files:**
- Create: `src/content-script/recipe-page/reviews-section.ts`
- Test: `tests/content-script/recipe-page/reviews-section.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/content-script/recipe-page/reviews-section.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Review } from '../../../src/types'
import { buildReviewsSection, renderReviewCard, applyFilter } from '../../../src/content-script/recipe-page/reviews-section'

const baseReview: Review = {
  id: 'rv-1', recipe_id: 'rec-1', user_id: 'u-1',
  type: 'comment', body: 'Great dish!', stars: 4,
  created_at: '2026-06-01T00:00:00Z',
  username: 'chef99', email: 'chef@example.com',
  likes: 5, dislikes: 1, user_vote: null,
}

describe('buildReviewsSection', () => {
  it('creates a section with id mixers-club-reviews', () => {
    const section = buildReviewsSection([], false)
    expect(section.id).toBe('mixers-club-reviews')
  })

  it('shows "Add your review" button when authenticated', () => {
    const section = buildReviewsSection([], true)
    expect(section.querySelector('#mc-add-review')).toBeTruthy()
    expect(section.querySelector('#mc-login-to-review')).toBeNull()
  })

  it('shows "Login to review" button when not authenticated', () => {
    const section = buildReviewsSection([], false)
    expect(section.querySelector('#mc-login-to-review')).toBeTruthy()
    expect(section.querySelector('#mc-add-review')).toBeNull()
  })

  it('renders review cards in the stripe content', () => {
    const section = buildReviewsSection([baseReview], true)
    const tiles = section.querySelectorAll('core-tile')
    expect(tiles.length).toBe(1)
  })
})

describe('renderReviewCard', () => {
  it('displays username, body, and stars', () => {
    const tile = renderReviewCard(baseReview)
    expect(tile.outerHTML).toContain('chef99')
    expect(tile.outerHTML).toContain('Great dish!')
    // 4 full stars
    const fullStars = tile.querySelectorAll('.core-rating__point--full')
    expect(fullStars.length).toBe(4)
  })

  it('includes gravatar img with identicon fallback', () => {
    const tile = renderReviewCard(baseReview)
    const img = tile.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('gravatar.com/avatar/')
    expect(img.src).toContain('d=identicon')
  })

  it('shows like and dislike counts', () => {
    const tile = renderReviewCard(baseReview)
    expect(tile.textContent).toContain('5')
    expect(tile.textContent).toContain('1')
  })
})

describe('applyFilter', () => {
  it('shows all tiles when filter is "all"', () => {
    document.body.innerHTML = `
      <core-tile data-type="comment"></core-tile>
      <core-tile data-type="warning"></core-tile>
    `
    applyFilter('all')
    const tiles = document.querySelectorAll('core-tile')
    tiles.forEach(t => expect((t as HTMLElement).style.display).not.toBe('none'))
  })

  it('hides tiles that do not match the filter type', () => {
    document.body.innerHTML = `
      <core-tile data-type="comment"></core-tile>
      <core-tile data-type="warning"></core-tile>
    `
    applyFilter('warning')
    expect(((document.querySelector('[data-type="comment"]') as HTMLElement).style.display)).toBe('none')
    expect(((document.querySelector('[data-type="warning"]') as HTMLElement).style.display)).not.toBe('none')
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/content-script/recipe-page/reviews-section.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/content-script/recipe-page/reviews-section.ts**

```ts
import type { Review, ReviewType } from '../../types'
import { gravatarUrl } from '../dom-helpers'

const TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

function buildStars(stars: number): string {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="core-rating__point${i < stars ? ' core-rating__point--full' : ''}"></span>`
  ).join('')
}

export function renderReviewCard(review: Review): HTMLElement {
  const tile = document.createElement('core-tile')
  tile.setAttribute('data-review-id', review.id)
  tile.setAttribute('data-type', review.type)
  tile.innerHTML = `
    <div class="core-tile__description-wrapper">
      <div class="core-tile__description">
        <img src="${gravatarUrl(review.email, 48)}" alt="${review.username}" width="48" height="48">
        <p class="core-tile__description-text">
          <strong>${review.username}</strong>
          <span style="margin-left:8px;text-transform:capitalize;">${review.type}</span>
        </p>
        <core-rating>
          <div class="core-rating__rating-list">${buildStars(review.stars)}</div>
        </core-rating>
        <p class="core-tile__description-subline">${review.body}</p>
        <div>
          <button
            class="core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn"
            data-review-id="${review.id}" data-value="1"
            ${review.user_vote === 1 ? 'disabled' : ''}>
            +${review.likes}
          </button>
          <button
            class="core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn"
            data-review-id="${review.id}" data-value="-1"
            ${review.user_vote === -1 ? 'disabled' : ''}>
            -${review.dislikes}
          </button>
        </div>
      </div>
    </div>
  `
  return tile
}

export function applyFilter(type: ReviewType | 'all'): void {
  document.querySelectorAll<HTMLElement>('core-tile[data-type]').forEach(tile => {
    const match = type === 'all' || tile.dataset['type'] === type
    tile.style.display = match ? '' : 'none'
  })
}

export function buildReviewsSection(reviews: Review[], authenticated: boolean): HTMLElement {
  const section = document.createElement('section')
  section.className = 'wf-spacing-bottom'
  section.id = 'mixers-club-reviews'

  const filterButtons = ['all', ...TYPES].map(t =>
    `<button class="core-chip-button core-chip-button--flat core-chip-button--x-small${t === 'all' ? ' core-chip-button--active' : ''}" data-mc-filter="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('')

  section.innerHTML = `
    <core-stripe class="core-stripe--modern" role="region" aria-labelledby="mc-stripe-header">
      <h3 class="core-stripe__header" id="mc-stripe-header">Mixers Club's Reviews</h3>
      <div id="mc-filter-chips" style="margin-bottom:8px">${filterButtons}</div>
      <div class="core-stripe__content" id="mc-reviews-content"></div>
      ${authenticated
        ? `<button class="button--primary" id="mc-add-review" style="margin-top:12px">Add your review</button>`
        : `<button class="button--primary" id="mc-login-to-review" style="margin-top:12px">Login to review</button>`}
    </core-stripe>
  `

  const content = section.querySelector('#mc-reviews-content')!
  reviews.forEach(r => content.appendChild(renderReviewCard(r)))

  // Filter chip interaction
  section.querySelector('#mc-filter-chips')!.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mc-filter]')
    if (!btn) return
    section.querySelectorAll('[data-mc-filter]').forEach(b =>
      b.classList.remove('core-chip-button--active'))
    btn.classList.add('core-chip-button--active')
    applyFilter(btn.dataset['mcFilter'] as ReviewType | 'all')
  })

  return section
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content-script/recipe-page/reviews-section.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content-script/recipe-page/reviews-section.ts tests/content-script/recipe-page/reviews-section.test.ts
git commit -m "feat: reviews carousel — cards, star display, filter chips"
```

---

## Task 11: Recipe page — star rating clone + Cookidoo watcher

**Files:**
- Create: `src/content-script/recipe-page/star-watcher.ts`
- Test: `tests/content-script/recipe-page/star-watcher.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/content-script/recipe-page/star-watcher.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildStarInput, syncFromCookidoo } from '../../../src/content-script/recipe-page/star-watcher'

describe('buildStarInput', () => {
  it('renders 5 star spans with data-value attributes', () => {
    const el = buildStarInput(null)
    const spans = el.querySelectorAll('.core-rating__point')
    expect(spans.length).toBe(5)
    spans.forEach((s, i) => {
      expect((s as HTMLElement).dataset['value']).toBe(String(i + 1))
    })
  })

  it('pre-fills stars when an existing rating is provided', () => {
    const el = buildStarInput(3)
    const full = el.querySelectorAll('.core-rating__point--full')
    expect(full.length).toBe(3)
  })

  it('shows no filled stars when rating is null', () => {
    const el = buildStarInput(null)
    const full = el.querySelectorAll('.core-rating__point--full')
    expect(full.length).toBe(0)
  })
})

describe('syncFromCookidoo', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('reads the data-rating attribute from core-rating when present', () => {
    document.body.innerHTML = '<core-rating data-rating="4"></core-rating>'
    const rating = syncFromCookidoo()
    expect(rating).toBe(4)
  })

  it('returns null when core-rating has no data-rating', () => {
    document.body.innerHTML = '<core-rating></core-rating>'
    const rating = syncFromCookidoo()
    expect(rating).toBeNull()
  })

  it('returns null when core-rating is absent', () => {
    expect(syncFromCookidoo()).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/content-script/recipe-page/star-watcher.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/content-script/recipe-page/star-watcher.ts**

```ts
// Reads the user's existing Cookidoo rating from the page.
// Cookidoo may store the user's personal vote in a data-rating attribute on
// the interactive core-rating element (authenticated page only).
// If the attribute is absent, returns null — the user hasn't rated yet.
export function syncFromCookidoo(): number | null {
  const ratingEl = document.querySelector('core-rating[data-rating]')
  const raw = ratingEl?.getAttribute('data-rating')
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

// Builds a clone of Cookidoo's core-rating structure for use inside our form.
// When a span is clicked, it updates the clone and attempts to click the real
// Cookidoo star (best-effort — Cookidoo's native UX fires if the real element exists).
export function buildStarInput(initialRating: number | null): HTMLElement {
  let currentRating = initialRating

  const el = document.createElement('core-rating')
  el.id = 'mc-star-input'

  const list = document.createElement('div')
  list.className = 'core-rating__rating-list'

  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span')
    span.className = 'core-rating__point' + (initialRating && i <= initialRating ? ' core-rating__point--full' : '')
    span.dataset['value'] = String(i)
    span.style.cursor = 'pointer'
    span.addEventListener('click', () => {
      currentRating = i
      updateCloneDisplay(list, i)
      triggerCookidooStar(i)
    })
    list.appendChild(span)
  }

  el.appendChild(list)

  // Watch for Cookidoo's real rating element confirming a vote
  observeCookidooRating((confirmedRating) => {
    currentRating = confirmedRating
    updateCloneDisplay(list, confirmedRating)
  })

  // Expose current rating for the form to read
  Object.defineProperty(el, 'selectedRating', { get: () => currentRating })

  return el
}

function updateCloneDisplay(list: HTMLElement, rating: number): void {
  list.querySelectorAll<HTMLElement>('.core-rating__point').forEach((span, i) => {
    span.className = 'core-rating__point' + (i < rating ? ' core-rating__point--full' : '')
  })
}

function triggerCookidooStar(value: number): void {
  // Cookidoo's interactive rating inputs are radio-style buttons or spans.
  // Try common selectors; fail silently if they don't exist.
  const realStars = document.querySelectorAll<HTMLElement>(
    'core-rating:not(#mc-star-input) .core-rating__point, ' +
    'core-rating:not(#mc-star-input) input[type="radio"]'
  )
  const target = realStars[value - 1]
  if (target) target.click()
}

function observeCookidooRating(onConfirm: (rating: number) => void): void {
  const observer = new MutationObserver(() => {
    const confirmed = syncFromCookidoo()
    if (confirmed !== null) onConfirm(confirmed)
  })
  const ratingEl = document.querySelector('core-rating:not(#mc-star-input)')
  if (ratingEl) {
    observer.observe(ratingEl, { attributes: true, subtree: true, childList: true })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content-script/recipe-page/star-watcher.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content-script/recipe-page/star-watcher.ts tests/content-script/recipe-page/star-watcher.test.ts
git commit -m "feat: star rating clone — builds interactive core-rating, wires Cookidoo native star"
```

---

## Task 12: Recipe page — review form + submission

**Files:**
- Create: `src/content-script/recipe-page/review-form.ts`
- Test: `tests/content-script/recipe-page/review-form.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/content-script/recipe-page/review-form.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildReviewForm } from '../../../src/content-script/recipe-page/review-form'

describe('buildReviewForm', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('renders type selector with all 5 review types', () => {
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit: vi.fn() })
    const typeButtons = form.querySelectorAll('[data-mc-type]')
    expect(typeButtons.length).toBe(5)
    const types = Array.from(typeButtons).map(b => b.getAttribute('data-mc-type'))
    expect(types).toEqual(['improvement', 'variation', 'comment', 'warning', 'other'])
  })

  it('renders a textarea for the review body', () => {
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit: vi.fn() })
    expect(form.querySelector('textarea#mc-body')).toBeTruthy()
  })

  it('calls onSubmit with correct payload when form is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ data: {}, error: null })
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit })
    document.body.appendChild(form)

    // Select a type
    const typeBtn = form.querySelector<HTMLButtonElement>('[data-mc-type="comment"]')!
    typeBtn.click()

    // Set star rating via the star input element's mock
    const starInput = form.querySelector('#mc-star-input') as HTMLElement & { selectedRating: number }
    Object.defineProperty(starInput, 'selectedRating', { get: () => 4 })

    // Fill body
    const textarea = form.querySelector<HTMLTextAreaElement>('#mc-body')!
    textarea.value = 'Loved this recipe'

    // Submit
    const submitBtn = form.querySelector<HTMLButtonElement>('#mc-submit')!
    submitBtn.click()
    await new Promise(r => setTimeout(r, 0))

    expect(onSubmit).toHaveBeenCalledWith({
      cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test',
      type: 'comment', stars: 4, body: 'Loved this recipe',
    })
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/content-script/recipe-page/review-form.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/content-script/recipe-page/review-form.ts**

```ts
import type { ReviewType } from '../../types'
import { buildStarInput, syncFromCookidoo } from './star-watcher'

interface FormOptions {
  cookidooId: string
  domain: string
  recipeName: string
  onSubmit: (payload: {
    cookidooId: string
    domain: string
    recipeName: string
    type: ReviewType
    stars: number
    body: string
  }) => Promise<{ data: unknown; error: string | null }>
}

const TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

export function buildReviewForm(opts: FormOptions): HTMLElement {
  const container = document.createElement('div')
  container.id = 'mc-review-form'

  let selectedType: ReviewType | null = null

  const typeButtons = TYPES.map(t =>
    `<button class="core-chip-button core-chip-button--flat core-chip-button--x-small" data-mc-type="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('')

  container.innerHTML = `
    <h4>Your Review</h4>
    <div id="mc-type-selector">${typeButtons}</div>
    <div id="mc-star-wrapper" style="margin:12px 0"></div>
    <textarea id="mc-body" rows="4" placeholder="Share your experience…"
      style="width:100%;box-sizing:border-box;padding:8px;margin:8px 0"></textarea>
    <p id="mc-form-error" style="color:red;display:none"></p>
    <button id="mc-submit" class="button--primary">Submit</button>
  `

  // Type selector
  container.querySelector('#mc-type-selector')!.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mc-type]')
    if (!btn) return
    container.querySelectorAll('[data-mc-type]').forEach(b => b.classList.remove('core-chip-button--active'))
    btn.classList.add('core-chip-button--active')
    selectedType = btn.dataset['mcType'] as ReviewType
  })

  // Star input
  const initialRating = syncFromCookidoo()
  const starInput = buildStarInput(initialRating) as HTMLElement & { selectedRating: number | null }
  container.querySelector('#mc-star-wrapper')!.appendChild(starInput)

  // Submit
  container.querySelector('#mc-submit')!.addEventListener('click', async () => {
    const errorEl = container.querySelector<HTMLElement>('#mc-form-error')!
    const body = (container.querySelector<HTMLTextAreaElement>('#mc-body')!).value.trim()
    const stars = starInput.selectedRating

    if (!selectedType) { errorEl.textContent = 'Please select a review type.'; errorEl.style.display = ''; return }
    if (!stars) { errorEl.style.display = 'none'; starInput.style.outline = '2px solid red'; return }
    if (!body) { errorEl.textContent = 'Please write something.'; errorEl.style.display = ''; return }

    errorEl.style.display = 'none'
    starInput.style.outline = ''
    const submitBtn = container.querySelector<HTMLButtonElement>('#mc-submit')!
    submitBtn.disabled = true
    submitBtn.textContent = 'Submitting…'

    const result = await opts.onSubmit({
      cookidooId: opts.cookidooId, domain: opts.domain, recipeName: opts.recipeName,
      type: selectedType, stars, body,
    })

    if (result.error) {
      errorEl.textContent = `Error: ${result.error}`
      errorEl.style.display = ''
      submitBtn.disabled = false
      submitBtn.textContent = 'Submit'
    } else {
      container.innerHTML = '<p>Review submitted! Thank you.</p>'
    }
  })

  return container
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content-script/recipe-page/review-form.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content-script/recipe-page/review-form.ts tests/content-script/recipe-page/review-form.test.ts
git commit -m "feat: review form — type selector, star input, body, validation, submission"
```

---

## Task 13: Recipe page — orchestration + voting

**Files:**
- Modify: `src/content-script/recipe-page/index.ts`

- [ ] **Step 1: Implement src/content-script/recipe-page/index.ts**

```ts
import type { Message, Review, Session } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildReviewsSection, renderReviewCard } from './reviews-section'
import { buildReviewForm } from './review-form'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

export async function initRecipePage(cookidooId: string, domain: string): Promise<void> {
  try {
    const recipeCard = await waitForElement('recipe-details#main-content recipe-card')
    const recipeDetails = recipeCard.closest('recipe-details')!
    const recipeContent = recipeDetails.querySelector('recipe-content')
    const recipeName = document.querySelector<HTMLElement>('.recipe-card__name')?.textContent?.trim() ?? ''

    const [reviewsResult, sessionResult] = await Promise.all([
      send<Review[]>({ action: 'getReviews', cookidooId, domain }),
      send<Session>({ action: 'getSession' }),
    ])

    const reviews = reviewsResult.data ?? []
    const authenticated = !!sessionResult.data

    const section = buildReviewsSection(reviews, authenticated)
    recipeDetails.insertBefore(section, recipeContent)

    // Voting
    section.addEventListener('click', async (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.mc-vote-btn')
      if (!btn || !authenticated) return
      const reviewId = btn.dataset['reviewId']!
      const value = Number(btn.dataset['value']) as 1 | -1
      btn.disabled = true
      await send({ action: 'vote', reviewId, value })

      // Optimistic update
      const countEl = btn
      const current = parseInt(countEl.textContent ?? '0', 10)
      countEl.textContent = (value === 1 ? '+' : '-') + (Math.abs(current) + 1)
    })

    // Review form toggle
    const addBtn = section.querySelector('#mc-add-review')
    const loginBtn = section.querySelector('#mc-login-to-review')

    if (loginBtn) {
      loginBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openPopup' }))
    }

    if (addBtn && authenticated) {
      addBtn.addEventListener('click', () => {
        if (section.querySelector('#mc-review-form')) return // already open

        const form = buildReviewForm({
          cookidooId,
          domain,
          recipeName,
          onSubmit: async (payload) => {
            const result = await send<Review>({ action: 'addReview', ...payload })
            if (result.data) {
              const content = section.querySelector('#mc-reviews-content')!
              content.insertBefore(renderReviewCard(result.data), content.firstChild)
            }
            return result
          },
        })

        section.querySelector('core-stripe')!.insertBefore(
          form,
          section.querySelector('#mc-add-review')
        )
        addBtn.textContent = 'Cancel'
        addBtn.addEventListener('click', () => {
          form.remove()
          addBtn.textContent = 'Add your review'
        }, { once: true })
      })
    }
  } catch (err) {
    // waitForElement already logged to console.error — nothing more to do here
  }
}
```

- [ ] **Step 2: Build and verify compilation**

```bash
npx vite build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/content-script/recipe-page/index.ts
git commit -m "feat: recipe page orchestration — inject reviews section, wire form and voting"
```

---

## Task 14: Home page — trending section

**Files:**
- Create: `src/content-script/home-page/trending-section.ts`
- Modify: `src/content-script/home-page/index.ts`
- Test: `tests/content-script/home-page/trending-section.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/content-script/home-page/trending-section.test.ts
import { describe, it, expect } from 'vitest'
import type { TrendingRecipe } from '../../../src/types'
import { buildTrendingSection } from '../../../src/content-script/home-page/trending-section'

const recipe: TrendingRecipe = {
  cookidoo_id: 'r268795', domain: 'cookidoo.co.uk',
  name: 'Lentil Curry', avg_stars: 4.5, review_count: 23, score: 14.2,
}

describe('buildTrendingSection', () => {
  it('creates a section with id mixers-club-trending', () => {
    const section = buildTrendingSection([])
    expect(section.id).toBe('mixers-club-trending')
  })

  it('renders one core-tile per recipe', () => {
    const section = buildTrendingSection([recipe])
    expect(section.querySelectorAll('core-tile').length).toBe(1)
  })

  it('includes the recipe name in the tile', () => {
    const section = buildTrendingSection([recipe])
    expect(section.textContent).toContain('Lentil Curry')
  })

  it('links to the correct Cookidoo recipe URL using current locale', () => {
    // jsdom sets window.location.pathname to '/'
    const section = buildTrendingSection([recipe])
    const link = section.querySelector<HTMLAnchorElement>('a')!
    expect(link.getAttribute('href')).toContain('r268795')
  })

  it('shows avg_stars and review_count', () => {
    const section = buildTrendingSection([recipe])
    expect(section.textContent).toContain('4.5')
    expect(section.textContent).toContain('23')
  })

  it('shows a message when no trending recipes', () => {
    const section = buildTrendingSection([])
    expect(section.textContent).toContain('No trending')
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/content-script/home-page/trending-section.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement src/content-script/home-page/trending-section.ts**

```ts
import type { TrendingRecipe } from '../../types'

function getLocaleFromPath(): string {
  const match = window.location.pathname.match(/\/foundation\/([^/]+)/)
  return match?.[1] ?? 'en-GB'
}

function buildRecipeTile(recipe: TrendingRecipe): HTMLElement {
  const locale = getLocaleFromPath()
  const tile = document.createElement('core-tile')
  tile.innerHTML = `
    <a class="link--alt" href="/recipes/recipe/${locale}/${recipe.cookidoo_id}">
      <div class="core-tile__description-wrapper">
        <div class="core-tile__description">
          <p class="core-tile__description-text">${recipe.name ?? recipe.cookidoo_id}</p>
          <core-rating class="core-rating--short core-rating--small">
            <span class="core-rating__counter">${recipe.avg_stars}</span>
            <span class="core-rating__point core-rating__point--full"></span>
            <span class="core-rating__label">(${recipe.review_count})</span>
          </core-rating>
        </div>
      </div>
    </a>
  `
  return tile
}

export function buildTrendingSection(recipes: TrendingRecipe[]): HTMLElement {
  const section = document.createElement('section')
  section.className = 'wf-spacing-bottom'
  section.id = 'mixers-club-trending'

  const content = recipes.length > 0
    ? recipes.map(buildRecipeTile).map(t => t.outerHTML).join('')
    : '<p style="padding:16px">No trending recipes this month yet. Be the first to review!</p>'

  section.innerHTML = `
    <core-stripe class="core-stripe--modern" role="region" aria-labelledby="mc-trending-header">
      <h3 class="core-stripe__header" id="mc-trending-header">Mixers Club — Trending This Month</h3>
      <div class="core-stripe__content" id="mc-trending-content">${content}</div>
    </core-stripe>
  `
  return section
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content-script/home-page/trending-section.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement src/content-script/home-page/index.ts**

```ts
import type { Message, TrendingRecipe } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildTrendingSection } from './trending-section'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

export async function initHomePage(_domain: string): Promise<void> {
  try {
    await waitForElement('div.l-main section')
    const main = document.querySelector<HTMLElement>('div.l-main')!

    const result = await send<TrendingRecipe[]>({ action: 'getTrending' })
    const recipes = result.data ?? []

    const section = buildTrendingSection(recipes)
    main.insertBefore(section, main.firstChild)
  } catch (err) {
    // waitForElement already logged the timeout error
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/content-script/home-page/ tests/content-script/home-page/
git commit -m "feat: home page trending section — fetches and injects top recipes of the month"
```

---

## Task 15: Full build verification + load extension in Chrome

**Files:** No new files — integration verification only.

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Production build**

```bash
npx vite build
```

Expected: clean build, no TypeScript errors, `dist/` contains all required files.

- [ ] **Step 3: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select `dist/` folder
4. Note the extension ID shown — update the Supabase Auth redirect URL if it differs from the key-derived ID set in Task 2 Step 5

- [ ] **Step 4: Smoke-test recipe page**

Navigate to `https://cookidoo.co.uk/recipes/recipe/en-GB/r268795`.

Expected: "Mixers Club's Reviews" section appears below the recipe card, above the ingredients. No JS errors in the console unrelated to auth.

- [ ] **Step 5: Smoke-test home page**

Navigate to `https://cookidoo.co.uk/foundation/en-GB/for-you`.

Expected: "Mixers Club — Trending This Month" section appears at the top of the page content.

- [ ] **Step 6: Smoke-test auth flow**

1. Click the extension icon → popup opens with email form
2. Enter email → click "Send magic link"
3. Check email → click the magic link
4. `auth-callback.html` opens briefly and closes
5. Click the extension icon again → shows username prompt
6. Enter username → popup shows "Signed in as [username]"

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: verified full build and manual smoke tests pass"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Auth: magic link, persistent session, first-time username prompt — Tasks 5, 8
- ✅ Supabase anon key only in extension, service_role stays in MCP — Task 2, Task 4 (supabase.ts)
- ✅ Supabase MCP for schema + auth config — Task 2
- ✅ Reviews carousel with filter chips — Task 10
- ✅ Review types: improvement/variation/comment/warning/other — Tasks 3, 10, 12
- ✅ Gravatar with identicon fallback — Task 9 (dom-helpers), Task 10 (cards)
- ✅ Star rating clone — Task 11
- ✅ Triggers Cookidoo's native star — Task 11 (`triggerCookidooStar`)
- ✅ MutationObserver watches Cookidoo rating element — Task 11 (`observeCookidooRating`)
- ✅ Cloned stars pre-filled if user already rated — Task 11 (`syncFromCookidoo`)
- ✅ Hiding rule: net < -3 AND dislike_ratio > 0.5 — Task 6 (`isHidden`)
- ✅ Sort by net score descending — Task 2 SQL function, Task 6
- ✅ "Add your review" / "Login to review" — Task 10, 13
- ✅ Inline review form — Task 12
- ✅ Submit → prepend card without reload — Task 13
- ✅ Voting with optimistic DOM update — Task 13
- ✅ Trending formula: avg_stars * ln(1 + count) — Task 2 SQL function
- ✅ Trending on home page — Tasks 14
- ✅ Injection point: after recipe-card, before recipe-content — Task 13
- ✅ Home page injection: first child of div.l-main — Task 14
- ✅ 10s timeout + console.error with domain + URL — Task 9 (waitForElement)
- ✅ No custom CSS/JS injected — all HTML uses Cookidoo classes
- ✅ Popup: login/logout only — Task 8
- ✅ RLS policies: users own their data — Task 2
- ✅ Recipe name stored in recipes table — Task 2 schema, Task 13 (passed to addReview)
- ✅ Locale extracted from URL for home page tile links — Task 14

**No placeholders found.**

**Type consistency:** `Review`, `Session`, `TrendingRecipe`, `Message`, `MessageResponse` defined once in `src/types.ts` and imported everywhere. `ReviewType` used consistently across `types.ts`, `reviews-section.ts`, `review-form.ts`, `api.ts`.
