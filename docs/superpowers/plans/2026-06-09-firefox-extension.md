# Firefox Extension Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firefox 128+ extension support to the existing Chrome extension, producing a separate `dist-firefox/` build and `mixers-club-vX.Y.Z-firefox.zip` alongside the existing Chrome artifacts.

**Architecture:** Zero TypeScript source changes — Firefox 128+ fully supports `chrome.*` namespace and MV3 service workers. All changes are build infrastructure: a Firefox manifest, a Vite mode flag, publish script platform support, and an updated release workflow.

**Tech Stack:** Vite, Node.js (CJS scripts), GitHub Actions, `archiver` npm package

**Branch:** `feature/firefox-extension`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `public/manifest.firefox.json` | Create | Firefox manifest with gecko ID |
| `vite.config.ts` | Modify | Add `--mode firefox` support, `dist-firefox/` output, manifest swap plugin |
| `package.json` | Modify | Add `build:chrome` and `build:firefox` scripts |
| `scripts/publish.js` | Modify | Add `--platform chrome\|firefox` flag, platform-suffixed zip names |
| `.github/workflows/release.yml` | Modify | Build both platforms, attach both zips to release |

---

## Task 1: Firefox Manifest

**Files:**
- Create: `public/manifest.firefox.json`

- [ ] **Step 1: Create `public/manifest.firefox.json`**

Copy `public/manifest.json` exactly and add `browser_specific_settings` after `"homepage_url"`:

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
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "*://translate.googleapis.com/*",
    "*://*.cookidoo.com/*",
    "*://*.cookidoo.es/*",
    "*://*.cookidoo.de/*",
    "*://*.cookidoo.fr/*",
    "*://*.cookidoo.it/*",
    "*://*.cookidoo.co.uk/*",
    "*://*.cookidoo.com.au/*",
    "*://*.cookidoo.co.nz/*",
    "*://*.cookidoo.jp/*",
    "*://*.cookidoo.com.br/*",
    "*://*.cookidoo.be/*",
    "*://*.cookidoo.nl/*",
    "*://*.cookidoo.pt/*",
    "*://*.cookidoo.ch/*",
    "*://*.cookidoo.at/*",
    "*://*.cookidoo.mx/*",
    "*://*.cookidoo.ca/*"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "*://*.cookidoo.com/*",
        "*://*.cookidoo.es/*",
        "*://*.cookidoo.de/*",
        "*://*.cookidoo.fr/*",
        "*://*.cookidoo.it/*",
        "*://*.cookidoo.co.uk/*",
        "*://*.cookidoo.com.au/*",
        "*://*.cookidoo.co.nz/*",
        "*://*.cookidoo.jp/*",
        "*://*.cookidoo.com.br/*",
        "*://*.cookidoo.be/*",
        "*://*.cookidoo.nl/*",
        "*://*.cookidoo.pt/*",
        "*://*.cookidoo.ch/*",
        "*://*.cookidoo.at/*",
        "*://*.cookidoo.mx/*",
        "*://*.cookidoo.ca/*"
      ],
      "js": [
        "content-script.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('public/manifest.firefox.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add public/manifest.firefox.json
git commit -m "feat: add Firefox manifest with gecko ID and strict_min_version 128"
```

---

## Task 2: Vite Build Configuration

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Replace `vite.config.ts` with mode-aware config**

Replace the entire file with:

```ts
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { copyFileSync, existsSync, rmSync } from 'fs'

function firefoxManifestPlugin(): Plugin {
  return {
    name: 'firefox-manifest',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist-firefox')
      const src = resolve(import.meta.dirname, 'public', 'manifest.firefox.json')
      const dest = resolve(outDir, 'manifest.json')
      const stale = resolve(outDir, 'manifest.firefox.json')
      copyFileSync(src, dest)
      if (existsSync(stale)) rmSync(stale)
    },
  }
}

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox'

  return {
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          'service-worker': resolve(import.meta.dirname, 'src/service-worker/index.ts'),
          'content-script': resolve(import.meta.dirname, 'src/content-script/index.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          format: 'es',
        },
      },
      outDir: isFirefox ? 'dist-firefox' : 'dist',
      emptyOutDir: true,
      copyPublicDir: true,
    },
    plugins: isFirefox ? [firefoxManifestPlugin()] : [],
  }
})
```

- [ ] **Step 2: Add build scripts to `package.json`**

In the `"scripts"` section, add `build:chrome` and `build:firefox` alongside the existing `"build"`:

```json
"build": "vite build",
"build:chrome": "vite build",
"build:firefox": "vite build --mode firefox",
```

- [ ] **Step 3: Test Chrome build still works**

```bash
pnpm run build
```

Expected: `dist/` folder created, `dist/manifest.json` is the original Chrome manifest (no `browser_specific_settings`).

```bash
node -e "const m=require('./dist/manifest.json'); console.log(!!m.browser_specific_settings ? 'FAIL' : 'OK - no gecko ID')"
```

Expected: `OK - no gecko ID`

- [ ] **Step 4: Test Firefox build**

```bash
pnpm run build:firefox
```

Expected: `dist-firefox/` folder created with same JS files as `dist/`.

- [ ] **Step 5: Verify Firefox manifest in output**

```bash
node -e "const m=require('./dist-firefox/manifest.json'); console.log(m.browser_specific_settings?.gecko?.id)"
```

Expected: `mixersclub@rodripf.com`

- [ ] **Step 6: Verify manifest.firefox.json is NOT in output**

```bash
node -e "const fs=require('fs'); console.log(fs.existsSync('dist-firefox/manifest.firefox.json') ? 'FAIL - file exists' : 'OK - cleaned up')"
```

Expected: `OK - cleaned up`

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts package.json
git commit -m "feat: add Firefox build mode (dist-firefox/) with manifest swap plugin"
```

---

## Task 3: Publish Script — Platform Support

**Files:**
- Modify: `scripts/publish.js`

The current script takes `version` as `argv[2]`. We add `--platform chrome|firefox` as an optional flag (default: `chrome`). The zip name changes to `mixers-club-v{version}-{platform}.zip`. The manifest to version-bump changes based on platform.

- [ ] **Step 1: Replace `scripts/publish.js` with the updated version**

```js
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const PLATFORMS = ['chrome', 'firefox'];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function askVersion() {
  const answer = await ask('Enter version number (e.g., 0.2.0): ');
  if (!answer.match(/^\d+\.\d+\.\d+$/)) {
    console.error('Invalid version format. Use semver (e.g., 0.2.0)');
    process.exit(1);
  }
  return answer;
}

async function askPlatform() {
  const answer = await ask('Platform [chrome/firefox] (default: chrome): ');
  if (!answer) return 'chrome';
  if (!PLATFORMS.includes(answer)) {
    console.error(`Invalid platform. Use: ${PLATFORMS.join(' or ')}`);
    process.exit(1);
  }
  return answer;
}

async function publish() {
  // Parse argv: node publish.js [version] [--platform chrome|firefox]
  const args = process.argv.slice(2);
  const platformFlagIdx = args.indexOf('--platform');
  let platform = platformFlagIdx !== -1 ? args[platformFlagIdx + 1] : null;
  const versionArg = args.find(a => !a.startsWith('--') && a !== (platform));

  let version;
  if (versionArg) {
    const clean = versionArg.replace(/^v/, '');
    if (!clean.match(/^\d+\.\d+\.\d+$/)) {
      console.error('Invalid version format. Use semver (e.g., 0.2.0 or v0.2.0)');
      process.exit(1);
    }
    version = clean;
  } else {
    version = await askVersion();
  }

  if (!platform) {
    // In CI (no TTY) default to chrome; interactively ask
    platform = process.stdin.isTTY ? await askPlatform() : 'chrome';
  }

  if (!PLATFORMS.includes(platform)) {
    console.error(`Invalid platform "${platform}". Use: ${PLATFORMS.join(' or ')}`);
    process.exit(1);
  }

  console.log(`\n📦 Publishing version ${version} for ${platform}...\n`);

  try {
    // Update package.json
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✓ Updated package.json to version ${version}`);

    // Update the correct manifest
    const manifestFile = platform === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
    const manifestPath = path.join(__dirname, '..', 'public', manifestFile);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✓ Updated ${manifestFile} to version ${version}`);

    // Build
    console.log('\n🔨 Building...');
    const buildCmd = platform === 'firefox' ? 'pnpm run build:firefox' : 'pnpm run build:chrome';
    execSync(buildCmd, { stdio: 'inherit' });

    // Create zip
    const zipName = `mixers-club-v${version}-${platform}.zip`;
    const distPath = path.join(__dirname, '..', platform === 'firefox' ? 'dist-firefox' : 'dist');
    const zipPath = path.join(__dirname, '..', zipName);

    console.log(`\n📦 Creating ${zipName}...`);

    const archiver = require('archiver');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(distPath + '/', false);
      archive.finalize();
    });
    console.log(`✓ Created ${zipName}`);

    const store = platform === 'firefox'
      ? 'Firefox Add-ons (addons.mozilla.org)'
      : 'Chrome Web Store Developer Dashboard';

    console.log(`\n✅ Ready to publish!\n`);
    console.log(`📁 Package: ${zipName}`);
    console.log(`📍 Location: ${zipPath}`);
    console.log(`\n Next: Upload ${zipName} to ${store}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

publish();
```

- [ ] **Step 2: Test Chrome packaging (non-interactive)**

```bash
node scripts/publish.js 0.4.0 --platform chrome
```

Expected output ends with: `✓ Created mixers-club-v0.4.0-chrome.zip`

Verify zip contents are at root (not nested in a folder):

```bash
node -e "
const AdmZip = require('adm-zip'); // use archiver's extract or just check with:
const { execSync } = require('child_process');
console.log(execSync('unzip -l mixers-club-v0.4.0-chrome.zip | head -8').toString());
"
```

Or on Windows PowerShell:
```powershell
Expand-Archive mixers-club-v0.4.0-chrome.zip -DestinationPath tmp-chrome-test
ls tmp-chrome-test
Remove-Item -Recurse tmp-chrome-test
```

Expected: `manifest.json`, `content-script.js`, `service-worker.js` etc. at root level — no wrapping folder.

- [ ] **Step 3: Test Firefox packaging (non-interactive)**

```bash
node scripts/publish.js 0.4.0 --platform firefox
```

Expected output ends with: `✓ Created mixers-club-v0.4.0-firefox.zip`

- [ ] **Step 4: Verify Firefox zip has gecko manifest**

```bash
node -e "
const fs = require('fs');
const archiver_extract = require('child_process').execSync;
// Extract manifest.json from zip and check for gecko ID
const out = archiver_extract('unzip -p mixers-club-v0.4.0-firefox.zip manifest.json').toString();
const m = JSON.parse(out);
console.log(m.browser_specific_settings?.gecko?.id === 'mixersclub@rodripf.com' ? 'OK' : 'FAIL');
"
```

On Windows, manually inspect by extracting the zip and checking `manifest.json` contains `"gecko"`.

- [ ] **Step 5: Clean up test zips**

```bash
rm -f mixers-club-v0.4.0-chrome.zip mixers-club-v0.4.0-firefox.zip
```

- [ ] **Step 6: Run tests to make sure nothing broke**

```bash
pnpm run typecheck && pnpm run test
```

Expected: all 82 tests passing, no type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/publish.js package.json
git commit -m "feat: add --platform flag to publish script, rename zips to include platform suffix"
```

---

## Task 4: GitHub Actions Release Workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Replace `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Get version
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> $GITHUB_OUTPUT

      - name: Build Chrome package
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: node scripts/publish.js ${{ github.ref_name }} --platform chrome

      - name: Build Firefox package
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: node scripts/publish.js ${{ github.ref_name }} --platform firefox

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: v${{ steps.version.outputs.version }}
          tag_name: ${{ github.ref_name }}
          files: |
            mixers-club-v${{ steps.version.outputs.version }}-chrome.zip
            mixers-club-v${{ steps.version.outputs.version }}-firefox.zip
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: build both Chrome and Firefox packages in release workflow"
```

---

## Task 5: Merge to Master

- [ ] **Step 1: Push the feature branch**

```bash
git push -u origin feature/firefox-extension
```

- [ ] **Step 2: Merge to master**

```bash
git checkout master
git pull
git merge feature/firefox-extension
git push
```

- [ ] **Step 3: Delete the feature branch**

```bash
git branch -d feature/firefox-extension
git push origin --delete feature/firefox-extension
```

- [ ] **Step 4: Tag and trigger release**

```bash
git tag v0.4.0 && git push origin v0.4.0
```

This triggers the release workflow, which will build both `mixers-club-v0.4.0-chrome.zip` and `mixers-club-v0.4.0-firefox.zip` and attach them to the GitHub release.
