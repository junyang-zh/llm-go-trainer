import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
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
const parseYaml = createRequire(import.meta.url)('js-yaml').load;
const feed = parseYaml(await readFile(join(resources, 'app-update.yml'), 'utf8'));
if (
  feed.provider !== 'github' ||
  feed.owner !== 'junyang-zh' ||
  feed.repo !== 'llm-go-trainer' ||
  feed.channel !== (variant === 'minimal' ? 'minimal' : 'latest')
)
  throw new Error('Packaged update feed does not match the edition');
const channel = `${variant === 'minimal' ? 'minimal' : 'latest'}${process.platform === 'darwin' ? '-mac' : ''}.yml`;
const update = parseYaml(await readFile(join('release', variant, channel), 'utf8'));
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const base = `LLM-Go-Trainer-${version}-${process.platform === 'darwin' ? 'mac-arm64' : 'windows-x64'}${variant === 'minimal' ? '-minimal' : ''}`;
const expectedFiles =
  process.platform === 'darwin' ? [`${base}.dmg`, `${base}.zip`] : [`${base}.exe`];
if (
  update.version !== version ||
  !Array.isArray(update.files) ||
  JSON.stringify(update.files.map((file: { url: string }) => file.url).sort()) !==
    JSON.stringify(expectedFiles.sort())
)
  throw new Error('Packaged update manifest does not match the edition');
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
