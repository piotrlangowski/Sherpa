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
  console.log('▶ Building SvelteKit app (vite build)...');
  run('npm run build', projectRoot);

  console.log('▶ Bundling dashboard into mcp-server/app/ ...');
  const appDir = path.join(mcpServerDir, 'app');
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.cpSync(path.join(projectRoot, 'build'), appDir, { recursive: true });
  const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(appDir, 'version.json'), JSON.stringify({ version: rootPkg.version }, null, 2));

  console.log('▶ Building MCP server (tsc)...');
  run('npm run build', mcpServerDir);

  console.log('▶ Pruning devDependencies for packaging...');
  run('npm ci --omit=dev', mcpServerDir);

  console.log('▶ Packing extension bundle...');
  run(`npx -y @anthropic-ai/mcpb pack . "${outputFile}"`, mcpServerDir);
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
