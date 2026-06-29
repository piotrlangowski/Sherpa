#!/usr/bin/env node
// Guard: forbid raw nullable numeric Zod inputs in the MCP server tool schemas.
//
// `z.number()....nullable()` renders in JSON Schema without a bare "type":"number"
// (it becomes an anyOf / ["number","null"]), so some MCP clients — notably Claude
// Desktop — send a stringified number that fails validation. The symptom: a numeric
// tool argument (e.g. service_action.value_per_outcome) silently can't be set.
//
// Use the nullableNumberInput({ min?, max? }) helper in mcp-server/src/index.ts, which
// coerces numeric strings back to numbers while preserving omit-vs-null semantics.
//
// Wired into the mcp-server `build` script so it gates every compile.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'mcp-server', 'src', 'index.ts');

const ANTIPATTERN = /z\.number\(\)(?:\.[a-zA-Z]+\([^)]*\))*\.nullable\(\)/;

const lines = readFileSync(target, 'utf8').split('\n');
const offenders = [];

lines.forEach((rawLine, i) => {
  // Strip inline comments so documentation that mentions the anti-pattern (e.g. the
  // helper's own doc comment) does not trigger a false positive.
  const line = rawLine.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
  if (ANTIPATTERN.test(line)) offenders.push({ line: i + 1, text: rawLine.trim() });
});

if (offenders.length > 0) {
  console.error(
    `[check-mcp-schemas] FAIL - ${offenders.length} raw nullable numeric MCP input(s):`
  );
  for (const o of offenders) console.error(`  index.ts:${o.line}  ${o.text}`);
  console.error(
    '\n  Replace z.number()....nullable().optional() with nullableNumberInput({ min?, max? }).\n' +
    '  Raw nullable numbers lose "type":"number" in JSON Schema and break number entry in Claude Desktop.'
  );
  process.exit(1);
}

console.error('[check-mcp-schemas] OK - no raw nullable numeric MCP inputs.');
