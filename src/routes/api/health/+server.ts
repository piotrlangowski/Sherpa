import { json } from '@sveltejs/kit';
import { version } from '$app/environment';
import type { RequestHandler } from './$types';
import { dbPath } from '$lib/server/db';

// Liveness/identity probe for the MCP launcher: `name` proves the port is ours,
// `version` lets a newer extension replace a stale instance, `dbPath` is a
// debugging aid (loopback-only exposure — HOST is pinned to 127.0.0.1).
export const GET: RequestHandler = async () => {
  return json({ ok: true, name: 'sherpa', version, dbPath });
};
