# Firefox Extension Support — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Firefox extension support to the existing Mixers Club Chrome extension, producing a separate `dist-firefox/` build and a `mixers-club-vX.Y.Z-firefox.zip` package from the same codebase.

**Architecture:** Zero TypeScript source changes. Firefox 128+ supports `chrome.*` as a full namespace alias and service workers in MV3. All infrastructure changes are in the build system only: a new Firefox manifest, a Vite mode flag, and publish script updates.

**Target:** Firefox 128+ (MV3 with service worker support)

---

## 1. Source Code Changes

**None.** All APIs used by the extension (`chrome.storage.local`, `chrome.runtime.sendMessage`, `chrome.runtime.onMessage`) are fully supported in Firefox 128+ under the `chrome.*` namespace alias. The auth redirect flow (magic link → Cookidoo page → content script handles `#access_token=` hash) also works identically.

---

## 2. Firefox Manifest

**File:** `public/manifest.firefox.json`

Identical to `public/manifest.json` with one addition — `browser_specific_settings` with a gecko ID:

```json
{
  "manifest_version": 3,
  "name": "Mixers Club",
  "version": "0.2.0",
  "description": "Community reviews and trending recipes for Cookidoo",
  "homepage_url": "https://github.com/rodripf/mixers_club/blob/master/PRIVACY.md",
  "browser_specific_settings": {
    "gecko": {
      "id": "mixersclub@rodripf.com",
      "strict_min_version": "128.0"
    }
  },
  "icons": { "16": "icon16.png", "48": "icon48.png", "128": "icon128.png" },
  "permissions": ["storage"],
  "host_permissions": [ ... same as manifest.json ... ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [ ... same as manifest.json ... ]
}
```

The `strict_min_version: "128.0"` ensures the extension is only installable on Firefox 128+, preventing installation on versions that don't support service workers in MV3.

---

## 3. Vite Build Configuration

**File:** `vite.config.ts`

Add a `--mode firefox` build path that:
- Copies `public/manifest.firefox.json` as `manifest.json` into the output
- Outputs to `dist-firefox/` instead of `dist/`
- Uses a Vite plugin or `rollupOptions` hook to swap the manifest

**Implementation approach:** Use Vite's `mode` option combined with a custom plugin that copies the correct manifest file during the build.

**New npm scripts in `package.json`:**
```json
"build": "vite build",
"build:chrome": "vite build",
"build:firefox": "vite build --mode firefox"
```

`build` and `build:chrome` are identical — the existing Chrome build is unchanged.

---

## 4. Publish Script

**File:** `scripts/publish.js`

Add a `--platform <chrome|firefox>` CLI flag (default: `chrome`).

**Behavior changes:**
- Platform defaults to `chrome` when not specified
- Output zip name: `mixers-club-v{version}-{platform}.zip` (e.g. `mixers-club-v0.4.0-chrome.zip`)
- Runs `pnpm run build` for chrome, `pnpm run build:firefox` for firefox
- Updates `manifest.json` version in `public/` for chrome, and `manifest.firefox.json` for firefox

**Usage:**
```bash
node scripts/publish.js 0.4.0                        # → mixers-club-v0.4.0-chrome.zip
node scripts/publish.js 0.4.0 --platform chrome      # → mixers-club-v0.4.0-chrome.zip
node scripts/publish.js 0.4.0 --platform firefox     # → mixers-club-v0.4.0-firefox.zip
```

The `pnpm run publish` interactive prompt also asks for platform.

---

## 5. GitHub Actions Release Workflow

**File:** `.github/workflows/release.yml`

Build both platforms in the same job and attach both zips to the GitHub release:

```yaml
- name: Build Chrome
  run: node scripts/publish.js ${{ github.ref_name }} --platform chrome

- name: Build Firefox
  run: node scripts/publish.js ${{ github.ref_name }} --platform firefox

- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      mixers-club-v${{ steps.version.outputs.version }}-chrome.zip
      mixers-club-v${{ steps.version.outputs.version }}-firefox.zip
```

---

## 6. Out of Scope

- Safari extension support
- Firefox Add-ons (AMO) automated submission — manual upload to addons.mozilla.org
- Polyfill for Firefox < 128
- Any changes to the Supabase backend or redirect URL configuration
