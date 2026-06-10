import path from 'path';
import fs from 'fs';
import os from 'os';

/** OS-specific user data directory for packaged installs. */
export function userDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Sherpa');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Sherpa');
}

/**
 * Resolution order (single source of truth for the app AND the MCP server):
 * 1. SHERPA_DB_PATH — always wins, even for a not-yet-existing file
 *    (dev/test separation depends on this). Guard against an unsubstituted
 *    "${user_config...}" placeholder from an extension host's mcp_config.
 * 2. repoDbPath — caller-supplied repo candidate; used when it exists,
 *    or unconditionally when preferRepoPath (the SvelteKit dev server).
 * 3. OS user data dir — packaged installs.
 */
export function resolveSherpaDbPath(opts: {
  repoDbPath?: string;
  preferRepoPath?: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
} = {}): string {
  const env = opts.env ?? process.env;
  const envDbPath = env.SHERPA_DB_PATH && !env.SHERPA_DB_PATH.includes('${')
    ? env.SHERPA_DB_PATH : undefined;
  if (envDbPath) return envDbPath;
  if (opts.repoDbPath && (opts.preferRepoPath || fs.existsSync(opts.repoDbPath))) return opts.repoDbPath;
  return path.join(userDataDir(opts.platform, env), 'sherpa.db');
}
