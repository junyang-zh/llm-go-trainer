#!/usr/bin/env node
// Both providers are authenticated in this fixture; no accounts or network.
const args = process.argv.slice(2).join(' ');
if (['login status', 'auth status'].includes(args)) process.exit(0);
await import('./fake-cli.mjs');
