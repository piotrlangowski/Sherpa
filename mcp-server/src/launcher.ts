import { spawn } from 'child_process';
import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dbPath } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));        // <pkg>/build
const lockPath = path.join(path.dirname(dbPath), 'dashboard.json');
const BASE_PORT = 4848;  // deliberately far from dev's 5173

interface DashboardLock {
  port: number;
  pid: number;
  version: string;
  mode: 'in-process';
  startedAt: string;
}

interface HealthResponse {
  ok: boolean;
  name: string;
  version: string;
  dbPath: string;
}

// Module-level singleton state to preserve the SvelteKit handler and active HTTP server
let state: {
  handler: any;
  port: number;
  httpServer: http.Server | null;
} | null = null;

function resolveAppDir(): string {
  const devAppDir = path.join(here, '..', '..', 'build');
  const packagedAppDir = path.join(here, '..', 'app');

  if (fs.existsSync(path.join(devAppDir, 'handler.js'))) return devAppDir;
  if (fs.existsSync(path.join(packagedAppDir, 'handler.js'))) return packagedAppDir;

  // Diagnostic error
  let listingExt = 'Could not read';
  let listingApp = 'Could not read';
  try { listingExt = fs.readdirSync(path.join(here, '..')).join(', '); } catch {}
  try { listingApp = fs.readdirSync(packagedAppDir).join(', '); } catch {}

  const isDevEnv = fs.existsSync(path.join(here, '..', '..', 'svelte.config.js'));
  const fixInstruction = isDevEnv
    ? 'Run "npm run build" in the repository root to compile the dashboard.'
    : 'Please uninstall the extension, restart Claude Desktop completely, and reinstall the new .mcpb bundle.';

  throw new Error(
    `Dashboard build not found.\n` +
    `Attempted paths:\n` +
    `- ${path.join(devAppDir, 'handler.js')}\n` +
    `- ${path.join(packagedAppDir, 'handler.js')}\n\n` +
    `Diagnostic details:\n` +
    `- Node version: ${process.version}\n` +
    `- Platform: ${process.platform}\n` +
    `- Extension dir contents: [${listingExt}]\n` +
    `- App dir contents: [${listingApp}]\n\n` +
    `How to fix:\n` +
    `${fixInstruction}`
  );
}

function expectedVersion(appDir: string): string {
  const versionJson = path.join(appDir, 'version.json');
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

function reservePort(start = BASE_PORT): Promise<{ port: number; server: net.Server }> {
  return new Promise((resolve, reject) => {
    let port = start;
    const maxPort = start + 50;

    const tryNext = () => {
      if (port >= maxPort) {
        reject(new Error(`Could not find a free port between ${start} and ${maxPort}`));
        return;
      }

      const server = net.createServer();
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          tryNext();
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        resolve({ port, server });
      });
    };

    tryNext();
  });
}

async function killAndWait(lock: { pid: number; port: number }): Promise<void> {
  try {
    process.kill(lock.pid);
  } catch (err: any) {
    if (err.code !== 'ESRCH') {
      console.error(`Failed to kill legacy dashboard process ${lock.pid}: ${err.message}`);
    }
  }

  // Poll until health check fails (server stopped)
  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    const health = await healthCheck(lock.port, 500);
    if (!health) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error(`Legacy dashboard process ${lock.pid} did not stop within 5s.`);
}

export async function ensureDashboard(): Promise<{ port: number; reused: boolean }> {
  const appDir = resolveAppDir();
  const expected = expectedVersion(appDir);

  // 1. If we have our own in-process server active in this runtime process
  if (state && state.httpServer) {
    const health = await healthCheck(state.port);
    if (health && health.dbPath === dbPath) {
      return { port: state.port, reused: true };
    }
  }

  // 2. If the server is in state but was stopped (httpServer is null)
  if (state && !state.httpServer) {
    const server = http.createServer(state.handler);
    server.unref();

    await new Promise<void>((resolve, reject) => {
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${state!.port} is occupied by another application. Please restart Claude Desktop.`));
        } else {
          reject(err);
        }
      });
      server.listen(state!.port, '127.0.0.1', () => {
        resolve();
      });
    });

    state.httpServer = server;

    const lock: DashboardLock = {
      port: state.port,
      pid: process.pid,
      version: expected,
      mode: 'in-process',
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    return { port: state.port, reused: false };
  }

  // 3. Inspect the disk lockfile for other instances (legacy/other MCP servers)
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const health = await healthCheck(lock.port);

      if (health) {
        if (health.dbPath !== dbPath) {
          // Serves a different database; leave it alone and run ours on a different port.
          console.error(`Dashboard on port ${lock.port} serves ${health.dbPath}, expected ${dbPath}. Starting our own.`);
        } else if (lock.mode === 'in-process') {
          // Another active MCP instance (e.g. dev alongside packaged extension)
          if (lock.pid !== process.pid) {
            if (health.version === expected) {
              return { port: lock.port, reused: true };
            } else {
              console.error(`Other active dashboard version v${health.version} != expected v${expected}. Launching ours on a free port.`);
              // Let it continue running, but we bind our own to a fresh port.
            }
          }
        } else {
          // Legacy out-of-process lock file (no mode). Perform deterministic migration by killing it.
          console.error(`Legacy out-of-process dashboard detected (PID ${lock.pid}); stopping it.`);
          await killAndWait(lock);
          fs.rmSync(lockPath, { force: true });
        }
      } else {
        // Dead server, cleanup stale lock file
        fs.rmSync(lockPath, { force: true });
      }
    } catch {
      fs.rmSync(lockPath, { force: true });
    }
  }

  // 4. Clean start of the in-process server
  const { port, server: reservedServer } = await reservePort();

  // Load shims and handler with environment variables set before import
  process.env.ORIGIN = `http://127.0.0.1:${port}`;
  process.env.SHERPA_DB_PATH = dbPath;
  process.env.HOST = '127.0.0.1';

  try {
    const shimsPath = pathToFileURL(path.join(appDir, 'shims.js')).href;
    const handlerPath = pathToFileURL(path.join(appDir, 'handler.js')).href;

    await import(shimsPath);
    const mod = await import(handlerPath);
    const handler = mod.handler;

    // Release the port reserve just before binding
    await new Promise<void>((resolve) => reservedServer.close(() => resolve()));

    const httpServer = http.createServer(handler);
    httpServer.unref();

    await new Promise<void>((resolve, reject) => {
      httpServer.on('error', (err) => reject(err));
      httpServer.listen(port, '127.0.0.1', () => resolve());
    });

    state = { handler, port, httpServer };

    const lock: DashboardLock = {
      port,
      pid: process.pid,
      version: expected,
      mode: 'in-process',
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

    // Async self-check test
    healthCheck(port).then((res) => {
      if (!res) {
        console.error(`Warning: In-process dashboard self-test failed on port ${port}.`);
      } else if (res.version !== expected) {
        console.error(`Warning: In-process dashboard version mismatch. Running: v${res.version}, Expected: v${expected}`);
      }
    }).catch(() => {});

    return { port, reused: false };
  } catch (err) {
    // Release the reserved server in case of import errors
    await new Promise<void>((resolve) => reservedServer.close(() => resolve()));
    throw err;
  }
}

export function openBrowser(url: string): void {
  // Spawn browser opener (fire-and-forget, detached)
  if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

export async function stopDashboard(): Promise<{ stopped: boolean; message: string }> {
  // 1. If we have our own in-process server active
  if (state && state.httpServer) {
    const server = state.httpServer;
    state.httpServer = null;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      if (typeof (server as any).closeIdleConnections === 'function') {
        (server as any).closeIdleConnections();
      }
      setTimeout(() => {
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        resolve();
      }, 2000).unref();
    });

    // Remove lockfile ONLY if it belongs to us
    if (fs.existsSync(lockPath)) {
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (lock.pid === process.pid && lock.mode === 'in-process') {
          fs.rmSync(lockPath, { force: true });
        }
      } catch {}
    }

    return { stopped: true, message: "Dashboard stopped." };
  }

  // 2. If no own server is running, check lockfile
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

      // If it's a legacy lock (no mode), we kill it
      if (!lock.mode) {
        await killAndWait(lock);
        fs.rmSync(lockPath, { force: true });
        return { stopped: true, message: `Legacy dashboard process ${lock.pid} stopped.` };
      }

      // If it's another in-process lock (cudzy pid)
      if (lock.mode === 'in-process' && lock.pid !== process.pid) {
        return { stopped: false, message: `Dashboard is served in-process by another Sherpa MCP instance (PID ${lock.pid}).` };
      }
    } catch (err: any) {
      fs.rmSync(lockPath, { force: true });
      return { stopped: true, message: `Removed corrupt lockfile: ${err.message}` };
    }
  }

  return { stopped: false, message: "Dashboard is not running." };
}
