import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { verified } from '../server/download';
import artifacts from '../config/katago/artifacts.json';
import bottles from '../config/katago/macos-bottles.json';

const variant = process.argv[2] ?? 'standard';
if (!['standard', 'minimal'].includes(variant) || process.argv.length > 3)
  throw new Error('Invalid package variant');
const resources = join(
  'release',
  variant,
  process.platform === 'darwin'
    ? 'mac-arm64/LLM Go Trainer.app/Contents/Resources'
    : 'win-unpacked/resources',
);
const models = join(resources, 'katago-models');
if (variant === 'standard') {
  const runtime = join(resources, 'katago-runtime');
  for (const artifact of process.platform === 'darwin' ? bottles : [artifacts.windows])
    if (!(await verified(join(runtime, artifact.sha256), artifact.sha256)))
      throw new Error(`Packaged runtime archive is missing or corrupt: ${artifact.name}`);
  if (
    !(await readFile(join(runtime, 'LICENSE.txt'))).equals(
      await readFile('config/katago/KATAGO-LICENSE.txt'),
    )
  )
    throw new Error('Packaged KataGo license is missing or incorrect');
  await readFile(join(runtime, 'sources.json'));
} else if ((await readdir(resources)).includes('katago-runtime')) {
  throw new Error('Minimal package must not contain a bundled KataGo runtime');
}
const icon = await readFile(join(resources, 'app-icon.png'));
const expectedIcon = await readFile('.local/icons/icon.png');
if (!icon.equals(expectedIcon))
  throw new Error('Packaged application icon does not match the logo');
if (process.platform === 'darwin') {
  const nativeIcon = await readFile(join(resources, 'icon.icns'));
  if (!nativeIcon.equals(await readFile('.local/icons/icon.icns')))
    throw new Error('macOS application icon does not match the logo');
}
if (variant === 'standard') {
  for (const artifact of [artifacts.main, artifacts.human])
    if (!(await verified(join(models, `${artifact.sha256}.bin.gz`), artifact.sha256)))
      throw new Error(`Packaged model is missing or corrupt: ${artifact.name}`);
  await readFile(join(models, 'LICENSE.txt'));
  await readFile(join(models, 'sources.json'));
} else if ((await readdir(resources)).includes('katago-models')) {
  throw new Error('Minimal package must not contain bundled models');
}
console.log(`Verified ${variant} packaged resources`);
