import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Resolve project paths dynamically relative to the script location
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const mcpServerBuild = path.join(projectRoot, 'mcp-server/build/index.js');
const mcpSkillsDir = path.join(projectRoot, 'mcp-skills');
const targetAgentSkillsDir = path.join(projectRoot, '.agent/skills');

console.log('===================================================');
console.log('         Sherpa MCP Server Installation            ');
console.log('===================================================');
console.log(`Project Root:   ${projectRoot}`);
console.log(`MCP Server:     ${mcpServerBuild}`);
console.log(`Source Skills:  ${mcpSkillsDir}`);
console.log(`Target Skills:  ${targetAgentSkillsDir}`);
console.log('---------------------------------------------------\n');

// 1. Check if the MCP server has been built
if (!fs.existsSync(mcpServerBuild)) {
  console.warn('\x1b[33m%s\x1b[0m', '⚠️  Warning: MCP server build not found at mcp-server/build/index.js.');
  console.warn('\x1b[33m%s\x1b[0m', '   Please build it by running:');
  console.warn('\x1b[33m%s\x1b[0m', '   cd mcp-server && npm install && npm run build\n');
}

// 2. Copy skills to .agent/skills/ for CLI agents (Claude Code, Antigravity)
try {
  if (fs.existsSync(mcpSkillsDir)) {
    if (!fs.existsSync(targetAgentSkillsDir)) {
      fs.mkdirSync(targetAgentSkillsDir, { recursive: true });
      console.log(`📁 Created agent skills directory: ${targetAgentSkillsDir}`);
    }
    
    const files = fs.readdirSync(mcpSkillsDir).filter(f => f.endsWith('.md'));
    let copiedCount = 0;
    for (const file of files) {
      const srcPath = path.join(mcpSkillsDir, file);
      const destPath = path.join(targetAgentSkillsDir, file);
      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✅ Copied skill: ${file}`);
      copiedCount++;
    }
    console.log(`\n🎉 Successfully installed ${copiedCount} skills for CLI agents!`);
  } else {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️  Warning: Source mcp-skills directory not found.');
  }
} catch (err) {
  console.error('\x1b[31m%s\x1b[0m', `❌ Error copying agent skills: ${err.message}`);
}

// 3. Configure Claude Desktop MCP
let configPath = '';
const home = os.homedir();
if (process.platform === 'darwin') {
  configPath = path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json');
} else if (process.platform === 'win32') {
  configPath = path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Claude/claude_desktop_config.json');
} else {
  // Linux fallback
  configPath = path.join(home, '.config/Claude/claude_desktop_config.json');
}

console.log(`\nConfiguring Claude Desktop MCP at:`);
console.log(`👉 ${configPath}`);

try {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`📁 Created directory: ${configDir}`);
  }

  let config = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (raw.trim()) {
      try {
        config = JSON.parse(raw);
      } catch (parseErr) {
        console.warn('\x1b[33m%s\x1b[0m', `⚠️  Warning: Existing config was not valid JSON. Starting fresh. Error: ${parseErr.message}`);
      }
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Register the server with absolute paths
  config.mcpServers['sherpa-roi-calculator'] = {
    command: 'node',
    args: [mcpServerBuild],
    cwd: projectRoot
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('\x1b[32m%s\x1b[0m', '🚀 Successfully registered "sherpa-roi-calculator" in Claude Desktop config!');
  console.log('\x1b[36m%s\x1b[0m', '\nℹ️  Notice: Restart your Claude Desktop application to load the MCP server.\n');
} catch (err) {
  console.error('\x1b[31m%s\x1b[0m', `❌ Error updating Claude Desktop config: ${err.message}`);
}
