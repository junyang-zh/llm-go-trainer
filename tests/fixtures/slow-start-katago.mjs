import { setTimeout as delay } from 'node:timers/promises';

process.stderr.write('OpenCL tuning in progress\n');
await delay(Number(process.env.FAKE_KATAGO_STARTUP_DELAY_MS) || 500);
process.stderr.write('Started, ready to begin handling requests\n');
await import('./fake-katago.mjs');
