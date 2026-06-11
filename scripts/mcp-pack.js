import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Builds the MCP server and packs it into sherpa.mcpb (Claude Desktop extension).
// devDependencies are pruned before packing so the bundle ships runtime deps only,
// then restored afterwards so the local dev environment keeps working.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const mcpServerDir = path.join(projectRoot, 'mcp-server');
const outputFile = path.join(projectRoot, 'sherpa.mcpb');

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

let packError = null;

try {
  console.log('▶ Reading configuration versions...');
  const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  console.log(`  Root version: ${rootPkg.version}`);

  console.log('▶ Syncing manifest.json version...');
  const manifestFile = path.join(mcpServerDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = rootPkg.version;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`  Synced manifest version to ${rootPkg.version}`);

  console.log('▶ Cleaning old builds...');
  fs.rmSync(path.join(mcpServerDir, 'build'), { recursive: true, force: true });
  const appDir = path.join(mcpServerDir, 'app');
  fs.rmSync(appDir, { recursive: true, force: true });

  console.log('▶ Building SvelteKit app (vite build)...');
  run('npm run build', projectRoot);

  console.log('▶ Bundling dashboard into mcp-server/app/ ...');
  fs.cpSync(path.join(projectRoot, 'build'), appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'version.json'), JSON.stringify({ version: rootPkg.version }, null, 2));

  console.log('▶ Building MCP server (tsc)...');
  run('npm run build', mcpServerDir);

  console.log('▶ Pruning devDependencies for packaging...');
  run('npm ci --omit=dev', mcpServerDir);

  // Assertions after staging, before packing
  console.log('▶ Verifying build assertions...');
  const assertExists = (filePath, isDir = false) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Assertion failed: ${filePath} does not exist.`);
    }
    const stat = fs.statSync(filePath);
    if (isDir && !stat.isDirectory()) {
      throw new Error(`Assertion failed: ${filePath} is not a directory.`);
    }
    if (!isDir && !stat.isFile()) {
      throw new Error(`Assertion failed: ${filePath} is not a file.`);
    }
  };

  assertExists(path.join(appDir, 'index.js'));
  assertExists(path.join(appDir, 'handler.js'));
  assertExists(path.join(appDir, 'version.json'));

  const appVersion = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')).version;
  if (appVersion !== rootPkg.version) {
    throw new Error(`Assertion failed: app/version.json version (${appVersion}) does not match root version (${rootPkg.version})`);
  }

  assertExists(path.join(appDir, 'client'), true);
  const clientFiles = fs.readdirSync(path.join(appDir, 'client'));
  if (clientFiles.length === 0) {
    throw new Error('Assertion failed: app/client directory is empty.');
  }

  assertExists(path.join(appDir, 'server'), true);
  assertExists(path.join(mcpServerDir, 'build', 'index.js'));
  assertExists(path.join(mcpServerDir, 'build', 'launcher.js'));
  assertExists(path.join(mcpServerDir, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'));
  assertExists(path.join(mcpServerDir, 'node_modules', 'zod', 'package.json'));
  console.log('✅ Build assertions passed successfully.');

  console.log('▶ Packing extension bundle...');
  run(`npx -y @anthropic-ai/mcpb pack . "${outputFile}"`, mcpServerDir);

  console.log('▶ Verifying packaged zip (sherpa.mcpb)...');
  try {
    const fileList = execSync(`unzip -Z1 "${outputFile}"`, { encoding: 'utf8' }).trim().split('\n');
    if (fileList.length < 1000) {
      throw new Error(`Zip contains only ${fileList.length} files, expected >= 1000.`);
    }
    // Check key files in zip
    const requiredInZip = [
      'build/index.js',
      'build/launcher.js',
      'manifest.json',
      'app/index.js',
      'app/handler.js'
    ];
    for (const req of requiredInZip) {
      if (!fileList.includes(req)) {
        throw new Error(`Zip missing required file: ${req}`);
      }
    }
    // Check manifest version in zip
    const manifestZip = execSync(`unzip -p "${outputFile}" manifest.json`, { encoding: 'utf8' });
    const zipManifest = JSON.parse(manifestZip);
    if (zipManifest.version !== rootPkg.version) {
      throw new Error(`Zip manifest version (${zipManifest.version}) does not match root version (${rootPkg.version})`);
    }
    console.log(`✅ Zip verification passed (${fileList.length} files).`);
  } catch (err) {
    if (err.message.includes('unzip: command not found') || (err.code && err.code === 'ENOENT')) {
      console.warn('⚠️  unzip command not available, skipping zip contents check.');
    } else {
      throw err;
    }
  }

} catch (err) {
  packError = err;
} finally {
  console.log('▶ Restoring devDependencies...');
  try {
    run('npm ci', mcpServerDir);
  } catch (restoreErr) {
    console.error('⚠️  Failed to restore devDependencies — run `npm ci` in mcp-server/ manually.');
  }
}

if (packError) {
  console.error('❌ Packaging failed:', packError.message);
  process.exit(1);
}

const sizeMb = (fs.statSync(outputFile).size / (1024 * 1024)).toFixed(1);
console.log(`\n✅ Created ${outputFile} (${sizeMb} MB)`);
console.log('   Install: Claude Desktop → Settings → Extensions → drag & drop the .mcpb file.');
