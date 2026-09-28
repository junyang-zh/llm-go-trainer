import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimePlatform } from '../server/installer';
import artifacts from '../config/katago/artifacts.json';

console.log(`Platform: ${process.platform}/${process.arch}; Node: ${process.version}`);
const directory = resolve(process.env.GO_TRAINER_DATA_DIR || '.local/katago');
let executable = process.env.KATAGO_PATH || 'katago';
let env = { ...process.env };
if (!process.env.KATAGO_MODEL) {
  console.log(`KataGo: automatic; data directory ${directory}`);
  try {
    const platform = runtimePlatform();
    const target = join(directory, `${platform.key}-${artifacts.revision}`);
    executable = join(target, 'bin', process.platform === 'win32' ? 'katago.exe' : 'katago');
    if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = join(target, 'lib');
    console.log(
      `Backend: ${platform.backend}; installation: ${existsSync(executable) ? 'present' : 'will download on launch'}`,
    );
    for (const artifact of [artifacts.main, artifacts.human])
      console.log(
        `${artifact.name}: ${existsSync(join(directory, 'models', `${artifact.sha256}.bin.gz`)) ? 'present' : 'will download on launch'}`,
      );
  } catch (error) {
    console.log((error as Error).message);
  }
} else {
  console.log('KataGo: custom paths');
  for (const key of ['KATAGO_MODEL', 'KATAGO_CONFIG', 'KATAGO_HUMAN_MODEL']) {
    const path = process.env[key] || (key === 'KATAGO_CONFIG' ? 'config/katago/analysis.cfg' : '');
    console.log(
      `${key}: ${path && existsSync(path) ? 'file found' : 'not configured / file missing'}`,
    );
  }
}
for (const [name, command, args] of [
  ['KataGo', executable, ['version']],
  [
    'Codex',
    process.env.CODEX_PATH || 'codex',
    [...(process.env.CODEX_SCRIPT ? [process.env.CODEX_SCRIPT] : []), '--version'],
  ],
  [
    'Claude',
    process.env.CLAUDE_PATH || 'claude',
    [...(process.env.CLAUDE_SCRIPT ? [process.env.CLAUDE_SCRIPT] : []), '--version'],
  ],
] as const) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10000,
    shell: false,
    windowsHide: true,
    env,
  });
  console.log(
    `${name}: ${result.status === 0 ? result.stdout.trim().split('\n')[0] : 'unavailable'}`,
  );
}
console.log(
  `DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? 'configured (hidden)' : 'not configured'}`,
);
