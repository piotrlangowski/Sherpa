import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const packageFile = path.join(projectRoot, 'package.json');
const bundleFile = path.join(projectRoot, 'sherpa.mcpb');

try {
  console.log('▶ Starting release workflow...');

  // 1. Read version
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const version = pkg.version;
  console.log(`  Target version: ${version}`);

  // 2. Check bundle existence
  if (!fs.existsSync(bundleFile)) {
    throw new Error(`Bundle file not found: ${bundleFile}. Please run "npm run mcp:pack" first.`);
  }

  // 3. Verify manifest version inside bundle
  console.log('▶ Verifying bundle version...');
  let zipManifest;
  try {
    const manifestZip = execSync(`unzip -p "${bundleFile}" manifest.json`, { encoding: 'utf8' });
    zipManifest = JSON.parse(manifestZip);
  } catch (err) {
    throw new Error(`Failed to extract manifest from bundle: ${err.message}. Please run "npm run mcp:pack" first.`);
  }

  if (zipManifest.version !== version) {
    throw new Error(`Bundle version (${zipManifest.version}) does not match package.json version (${version}). Please re-run "npm run mcp:pack".`);
  }
  console.log('  Bundle version matches package.json.');

  // 4. Check gh tool installation
  console.log('▶ Checking GitHub CLI (gh) installation...');
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch (err) {
    console.error('\n⚠️  GitHub CLI (gh) is not installed on this machine.');
    console.error('To install it:');
    console.error('  macOS: brew install gh');
    console.error('  Windows: winget install GitHub.cli   or download from https://cli.github.com/');
    console.error('\nAfter installing, authenticate with:');
    console.error('  gh auth login\n');
    process.exit(1);
  }

  // 5. Check gh auth status
  try {
    execSync('gh auth status', { stdio: 'inherit' });
  } catch (err) {
    console.error('\n⚠️  GitHub CLI (gh) is not authenticated.');
    console.error('Please run:');
    console.error('  gh auth login\n');
    process.exit(1);
  }

  // 6. Check for uncommitted changes
  console.log('▶ Checking git status...');
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (gitStatus) {
      console.warn('\n⚠️  Warning: You have uncommitted changes in your repository:');
      console.warn(gitStatus);
      console.warn('Proceeding with release anyway...\n');
    }
  } catch (err) {
    console.warn('⚠️  Could not run "git status", proceeding...');
  }

  // 7. Create GitHub release
  const tag = `v${version}`;
  console.log(`▶ Creating GitHub Release for ${tag}...`);
  const ghCommand = `gh release create "${tag}" "${bundleFile}" --title "Sherpa ${tag}" --generate-notes`;
  execSync(ghCommand, { cwd: projectRoot, stdio: 'inherit' });

  console.log('\n==================================================');
  console.log('🎉 GitHub Release created successfully!');
  console.log(`Release download link: https://github.com/piotrlangowski/Sherpa/releases/latest/download/sherpa.mcpb`);
  console.log('==================================================\n');

} catch (err) {
  console.error('\n❌ Release workflow failed:', err.message);
  process.exit(1);
}
