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
 *    (dev/test separation depends on this). Trimmed first: an extension host's
 *    mcp_config substitution can leave a trailing space/newline, which would
 *    silently open a *different* SQLite file (e.g. "sherpa.db " with a trailing
 *    space) and lose every write. Then guard against an unsubstituted
 *    "${user_config...}" placeholder from that same mcp_config.
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
  const raw = env.SHERPA_DB_PATH?.trim();
  const envDbPath = raw && !raw.includes('${') ? raw : undefined;
  if (envDbPath) return envDbPath;
  const repoDbPath = opts.repoDbPath?.trim();
  if (repoDbPath && (opts.preferRepoPath || fs.existsSync(repoDbPath))) return repoDbPath;
  return path.join(userDataDir(opts.platform, env), 'sherpa.db');
}
