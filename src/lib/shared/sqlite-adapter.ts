import { DatabaseSync } from 'node:sqlite';
import type { DatabaseConnection } from './db-schema.js';

/**
 * Adapter giving node:sqlite's DatabaseSync a better-sqlite3-shaped surface
 * (`transaction()`, `prepare().run/get/all`, `pragma()`) so the shared schema,
 * seed, and the repositories run unchanged.
 *
 * Single source of truth for both the SvelteKit app (`src/lib/server/db.ts`)
 * and the MCP server (`mcp-server/src/db.ts`). Lives in `shared/` so the MCP
 * build picks it up through the symlink — keep relative imports `.js`-suffixed.
 */
export class SherpaDatabase extends DatabaseSync implements DatabaseConnection {
  private transactionDepth = 0;

  /** Mimics better-sqlite3's `db.transaction(fn)` — returns a wrapped fn that
   *  runs inside BEGIN/COMMIT, with SAVEPOINTs for nested calls. */
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return (...args: any[]) => {
      const isTopLevel = this.transactionDepth === 0;
      this.transactionDepth++;
      if (isTopLevel) {
        this.exec('BEGIN');
      } else {
        this.exec(`SAVEPOINT t${this.transactionDepth}`);
      }
      try {
        const result = fn(...args);
        if (isTopLevel) {
          this.exec('COMMIT');
        } else {
          this.exec(`RELEASE t${this.transactionDepth}`);
        }
        return result;
      } catch (err) {
        if (isTopLevel) {
          this.exec('ROLLBACK');
        } else {
          this.exec(`ROLLBACK TO t${this.transactionDepth}`);
        }
        throw err;
      } finally {
        this.transactionDepth--;
      }
    };
  }

  /** node:sqlite rejects `undefined` params; map them to `null` (the codebase
   *  only ever binds positional `?` params, never named-object binding). */
  prepare(sql: string): any {
    const stmt = super.prepare(sql);
    return {
      run: (...params: any[]): any => stmt.run(...params.map((p) => (p === undefined ? null : p))),
      all: (...params: any[]): any => stmt.all(...params.map((p) => (p === undefined ? null : p))),
      get: (...params: any[]): any => stmt.get(...params.map((p) => (p === undefined ? null : p)))
    };
  }

  /** Only ever used to set pragmas (e.g. `journal_mode = WAL`), never to read. */
  pragma(sql: string): void {
    this.exec(`PRAGMA ${sql}`);
  }
}
