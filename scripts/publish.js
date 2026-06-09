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
  const versionArg = args.find(a => !a.startsWith('--') && a !== platform);

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
