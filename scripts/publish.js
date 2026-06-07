#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

function askVersion() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter version number (e.g., 0.2.0): ', (answer) => {
      rl.close();
      if (!answer.match(/^\d+\.\d+\.\d+$/)) {
        console.error('Invalid version format. Use semver (e.g., 0.2.0)');
        process.exit(1);
      }
      resolve(answer);
    });
  });
}

async function publish() {
  // Accept version as CLI arg (for CI) or prompt interactively
  const argVersion = process.argv[2];
  let version;
  if (argVersion) {
    const clean = argVersion.replace(/^v/, '');
    if (!clean.match(/^\d+\.\d+\.\d+$/)) {
      console.error('Invalid version format. Use semver (e.g., 0.2.0 or v0.2.0)');
      process.exit(1);
    }
    version = clean;
  } else {
    version = await askVersion();
  }

  console.log(`\n📦 Publishing version ${version}...\n`);

  try {
    // Update package.json
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✓ Updated package.json to version ${version}`);

    // Update manifest.json
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✓ Updated manifest.json to version ${version}`);

    // Build
    console.log('\n🔨 Building...');
    execSync('pnpm run build', { stdio: 'inherit' });

    // Create zip
    const zipName = `mixers-club-v${version}.zip`;
    const distPath = path.join(__dirname, '..', 'dist');
    const zipPath = path.join(__dirname, '..', zipName);

    console.log(`\n📦 Creating ${zipName}...`);

    // Zip dist contents directly (no wrapping folder) using archiver
    const archiver = require('archiver');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      // false = don't include the 'dist' folder itself, just its contents
      archive.directory(distPath + '/', false);
      archive.finalize();
    });
    console.log(`✓ Created ${zipName}`);

    console.log(`\n✅ Ready to publish!\n`);
    console.log(`📁 Package: ${zipName}`);
    console.log(`📍 Location: ${zipPath}`);
    console.log(`\n Next: Upload ${zipName} to Chrome Web Store Developer Dashboard`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

publish();
