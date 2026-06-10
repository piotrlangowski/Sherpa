import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbPath } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));        // <pkg>/build
const packagedApp = path.join(here, '..', 'app', 'index.js');     // .mcpb layout
const devApp = path.join(here, '..', '..', 'build', 'index.js');  // repo layout (sherpa-dev)
const lockPath = path.join(path.dirname(dbPath), 'dashboard.json');
const logPath = path.join(path.dirname(dbPath), 'dashboard.log');
const BASE_PORT = 4848;  // deliberately far from dev's 5173

interface DashboardLock { port: number; pid: number; version: string; startedAt: string; }
interface HealthResponse { ok: boolean; name: string; version: string; dbPath: string; }

function resolveAppEntry(): string {
  if (fs.existsSync(packagedApp)) return packagedApp;
  if (fs.existsSync(devApp)) return devApp;
  throw new Error(
    'Dashboard build not found. Run `npm run build` in the Sherpa repo root, then try again.'
  );
}

/** Packaged: version.json written next to app/index.js by scripts/mcp-pack.js.
 *  Dev: the repo root package.json. */
function expectedVersion(appEntry: string): string {
  const versionJson = path.join(path.dirname(appEntry), 'version.json');
  if (fs.existsSync(versionJson)) return JSON.parse(fs.readFileSync(versionJson, 'utf8')).version;
  return JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')).version;
}

async function healthCheck(port: number, timeoutMs = 1500): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const body = (await res.json()) as HealthResponse;
    return body.ok && body.name === 'sherpa' ? body : null;
  } catch { return null; }
}

function findFreePort(start = BASE_PORT): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = start;
    const maxPort = start + 50;

    const tryNext = () => {
      if (port >= maxPort) {
        reject(new Error(`Could not find a free port between ${start} and ${maxPort}`));
        return;
      }

      const server = net.createServer();
      server.unref();

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          tryNext();
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        server.close(() => {
          resolve(port);
        });
      });
    };

    tryNext();
  });
}

function spawnDashboard(appEntry: string, port: number): number /* pid */ {
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [appEntry], {
    detached: true,
    stdio: ['ignore', out, out],   // NEVER 'inherit' — our stdout is JSON-RPC
    cwd: path.dirname(appEntry),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',                        // loopback only — local-first
      ORIGIN: `http://127.0.0.1:${port}`,       // without it: 403 on every form action
      SHERPA_DB_PATH: dbPath,                   // resolved value, never the raw env/placeholder
      ELECTRON_RUN_AS_NODE: '1'                 // in case execPath is Electron's binary
    }
  });
  child.unref();
  return child.pid!;
}

async function killAndWait(lock: DashboardLock): Promise<void> {
  try {
    process.kill(lock.pid);
  } catch (err: any) {
    if (err.code !== 'ESRCH') {
      console.error(`Failed to kill dashboard process ${lock.pid}: ${err.message}`);
    }
  }

  // Poll until health check fails (server stopped)
  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    const health = await healthCheck(lock.port, 500);
    if (!health) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error(`Dashboard process ${lock.pid} did not stop within 5s.`);
}

async function waitForHealthy(port: number, timeoutMs = 10000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const health = await healthCheck(port, 500);
    if (health) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Dashboard failed to start on port ${port} within ${timeoutMs}ms. Check logs at: ${logPath}`
  );
}

export async function ensureDashboard(): Promise<{ port: number; reused: boolean }> {
  const appEntry = resolveAppEntry();
  const expected = expectedVersion(appEntry);
  // 1. Try the lockfile
  if (fs.existsSync(lockPath)) {
    try {
      const lock: DashboardLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const health = await healthCheck(lock.port);
      if (health) {
        if (health.version === expected) return { port: lock.port, reused: true };
        // stale version from a previous extension install → replace
        console.error(`Dashboard v${health.version} != bundled v${expected}; restarting.`);
        await killAndWait(lock);
      }
    } catch { /* corrupt lockfile → fall through to fresh spawn */ }
    fs.rmSync(lockPath, { force: true });
  }
  // 2. Fresh spawn
  const port = await findFreePort();
  const pid = spawnDashboard(appEntry, port);
  await waitForHealthy(port, 10_000);   // poll every 250 ms; on timeout throw with logPath hint
  const lock: DashboardLock = { port, pid, version: expected, startedAt: new Date().toISOString() };
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return { port, reused: false };
}

export function openBrowser(url: string): void {
  // fire-and-forget; detached so the browser doesn't tie to our lifetime
  if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

export async function stopDashboard(): Promise<boolean> {
  if (!fs.existsSync(lockPath)) return false;
  try {
    const lock: DashboardLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    await killAndWait(lock);
  } catch (err: any) {
    console.error(`Error stopping dashboard: ${err.message}`);
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
  return true;
}
