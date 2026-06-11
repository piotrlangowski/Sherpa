// Guard stdout from non-JSON-RPC printouts (e.g. SvelteKit startup/logging, third-party libraries).
// MCP SDK uses process.stdout.write directly to send JSON-RPC, so this override only affects high-level console logging.

const originalError = console.error;

console.log = (...args: any[]) => originalError.apply(console, args);
console.info = (...args: any[]) => originalError.apply(console, args);
console.debug = (...args: any[]) => originalError.apply(console, args);
console.warn = (...args: any[]) => originalError.apply(console, args);

originalError("Console output redirected to stderr.");
