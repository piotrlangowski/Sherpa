import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateGuidanceContent } from './gen-guidance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputFile = path.join(projectRoot, 'mcp-server', 'src', 'generated', 'guidance.ts');

if (!fs.existsSync(outputFile)) {
  console.error(`❌ Generated guidance file does not exist: ${outputFile}`);
  console.error(`   Please run "npm run gen:guidance" or build the project first.`);
  process.exit(1);
}

try {
  const expectedContent = generateGuidanceContent();
  const actualContent = fs.readFileSync(outputFile, 'utf8');

  if (expectedContent !== actualContent) {
    console.error(`❌ Error: Generated guidance file is out of sync with mcp-skills/ directory!`);
    console.error(`   Please run "npm run gen:guidance" to regenerate it.`);
    process.exit(1);
  }

  console.log(`✅ Guidance sync check passed. mcp-skills/ matches committed guidance.ts`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Guidance check failed with error: ${err.message}`);
  process.exit(1);
}
