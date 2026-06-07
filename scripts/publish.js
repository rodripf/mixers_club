#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askVersion() {
  return new Promise((resolve) => {
    rl.question('Enter version number (e.g., 0.2.0): ', (answer) => {
      if (!answer.match(/^\d+\.\d+\.\d+$/)) {
        console.error('Invalid version format. Use semver (e.g., 0.2.0)');
        process.exit(1);
      }
      resolve(answer);
    });
  });
}

async function publish() {
  const version = await askVersion();
  rl.close();

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

    // Use built-in zip or cross-platform archiver
    try {
      if (process.platform === 'win32') {
        // Windows: use PowerShell
        execSync(
          `powershell -NoProfile -Command "Compress-Archive -Path '${distPath}/*' -DestinationPath '${zipPath}' -Force"`,
          { stdio: 'inherit' }
        );
      } else {
        // Unix: use zip
        execSync(`cd ${path.dirname(distPath)} && zip -r ${zipPath} dist/`, { stdio: 'inherit' });
      }
      console.log(`✓ Created ${zipName}`);
    } catch (e) {
      // Fallback: use archiver if zip command not available
      console.log('Attempting to create zip with Node archiver...');
      const archiver = require('archiver');
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log(`✓ Created ${zipName}`);
          resolve();
        });
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(distPath + '/', false);
        archive.finalize();
      });
    }

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
