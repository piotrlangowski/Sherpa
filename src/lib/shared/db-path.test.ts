import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSherpaDbPath, userDataDir } from './db-path';

describe('db-path resolver', () => {
  let tempDirs: string[] = [];

  function createTempDir(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-test-'));
    tempDirs.push(tempDir);
    return tempDir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        // ignore cleanup errors in tests
      }
    }
    tempDirs = [];
  });

  describe('userDataDir', () => {
    it('returns macOS path', () => {
      const dir = userDataDir('darwin', {});
      expect(dir).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa'));
    });

    it('returns Windows path when APPDATA is set', () => {
      const dir = userDataDir('win32', { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' });
      expect(dir).toBe(path.join('C:\\Users\\Test\\AppData\\Roaming', 'Sherpa'));
    });

    it('returns Windows path fallback when APPDATA is not set', () => {
      const dir = userDataDir('win32', {});
      expect(dir).toBe(path.join(os.homedir(), 'AppData', 'Roaming', 'Sherpa'));
    });

    it('returns Linux path when XDG_DATA_HOME is set', () => {
      const dir = userDataDir('linux', { XDG_DATA_HOME: '/custom/xdg' });
      expect(dir).toBe('/custom/xdg/Sherpa');
    });

    it('returns Linux path fallback when XDG_DATA_HOME is not set', () => {
      const dir = userDataDir('linux', {});
      expect(dir).toBe(path.join(os.homedir(), '.local', 'share', 'Sherpa'));
    });
  });

  describe('resolveSherpaDbPath', () => {
    it('returns SHERPA_DB_PATH if set and valid', () => {
      const resolved = resolveSherpaDbPath({
        env: { SHERPA_DB_PATH: '/some/custom/path.db' }
      });
      expect(resolved).toBe('/some/custom/path.db');
    });

    it('ignores SHERPA_DB_PATH if it contains "${"', () => {
      const resolved = resolveSherpaDbPath({
        env: { SHERPA_DB_PATH: '${user_config.database_path}' },
        platform: 'darwin'
      });
      expect(resolved).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa', 'sherpa.db'));
    });

    it('trims trailing whitespace/newline from SHERPA_DB_PATH', () => {
      // An mcp_config substitution can leave a trailing space/newline; without
      // trimming this opens a *different* SQLite file (e.g. "sherpa.db ").
      const resolved = resolveSherpaDbPath({
        env: { SHERPA_DB_PATH: '/some/custom/path.db \n' }
      });
      expect(resolved).toBe('/some/custom/path.db');
    });

    it('still applies the "${" placeholder guard after trimming', () => {
      const resolved = resolveSherpaDbPath({
        env: { SHERPA_DB_PATH: '  ${user_config.database_path}  ' },
        platform: 'darwin'
      });
      expect(resolved).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa', 'sherpa.db'));
    });

    it('treats a whitespace-only SHERPA_DB_PATH as unset', () => {
      const resolved = resolveSherpaDbPath({
        env: { SHERPA_DB_PATH: '   ' },
        platform: 'darwin'
      });
      expect(resolved).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa', 'sherpa.db'));
    });

    it('returns repoDbPath if it exists on disk', () => {
      const tempDir = createTempDir();
      const existingFile = path.join(tempDir, 'repo.db');
      fs.writeFileSync(existingFile, 'dummy db');

      const resolved = resolveSherpaDbPath({
        repoDbPath: existingFile,
        platform: 'darwin'
      });
      expect(resolved).toBe(existingFile);
    });

    it('returns repoDbPath even if it does not exist if preferRepoPath is true', () => {
      const tempDir = createTempDir();
      const nonExistingFile = path.join(tempDir, 'nonexistent.db');

      const resolved = resolveSherpaDbPath({
        repoDbPath: nonExistingFile,
        preferRepoPath: true,
        platform: 'darwin'
      });
      expect(resolved).toBe(nonExistingFile);
    });

    it('falls back to userDataDir if repoDbPath does not exist and preferRepoPath is false', () => {
      const tempDir = createTempDir();
      const nonExistingFile = path.join(tempDir, 'nonexistent.db');

      const resolved = resolveSherpaDbPath({
        repoDbPath: nonExistingFile,
        preferRepoPath: false,
        platform: 'darwin'
      });
      expect(resolved).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa', 'sherpa.db'));
    });
  });
});
