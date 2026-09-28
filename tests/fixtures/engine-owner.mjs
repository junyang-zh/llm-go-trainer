import { KataGo } from '../../server/katago.ts';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fake-katago.mjs', import.meta.url));
const engine = new KataGo({
  executable: process.execPath,
  prefixArgs: [fixture],
  model: fixture,
  config: fixture,
  timeout: 3000,
});
await engine.initialize();
console.log(engine.status().pid);
process.stdin.on('data', () => process.exit(0));
