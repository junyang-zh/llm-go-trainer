import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { verified } from '../server/download';
import artifacts from '../config/katago/artifacts.json';

const variant = process.argv[2];
if (!['with-models', 'no-models'].includes(variant)) throw new Error('Invalid package variant');
const resources = join(
  'release',
  variant,
  process.platform === 'darwin'
    ? 'mac-arm64/LLM Go Trainer.app/Contents/Resources'
    : 'win-unpacked/resources',
);
const models = join(resources, 'katago-models');
if (variant === 'with-models') {
  for (const artifact of [artifacts.main, artifacts.human])
    if (!(await verified(join(models, `${artifact.sha256}.bin.gz`), artifact.sha256)))
      throw new Error(`Packaged model is missing or corrupt: ${artifact.name}`);
  await readFile(join(models, 'LICENSE.txt'));
  await readFile(join(models, 'sources.json'));
} else if ((await readdir(resources)).includes('katago-models')) {
  throw new Error('No-models package must not contain bundled models');
}
console.log(`Verified ${variant} packaged resources`);
