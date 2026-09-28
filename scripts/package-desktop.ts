import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build, Platform, Arch } from 'electron-builder';
import { downloadArtifact } from '../server/download';
import artifacts from '../config/katago/artifacts.json';

const variant = process.argv[2] ?? 'no-models';
if (!['with-models', 'no-models'].includes(variant) || process.argv.length > 3)
  throw new Error('Usage: npm run package:desktop -- [with-models|no-models]');
const mac = process.platform === 'darwin' && process.arch === 'arm64';
const win = process.platform === 'win32' && process.arch === 'x64';
if (!mac && !win) throw new Error('Build on Apple Silicon macOS or Windows x64');
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error(`Release tag must match package.json: v${version}`);

// Stage only explicitly verified models; never package local settings or engine caches.
const staging = join(root, '.local', 'release-models');
await rm(staging, { recursive: true, force: true });
if (variant === 'with-models') {
  await mkdir(staging, { recursive: true });
  for (const artifact of [artifacts.main, artifacts.human]) {
    console.log(`Preparing ${artifact.name}`);
    const source = await downloadArtifact(
      artifact,
      join(root, '.local', 'katago', 'downloads'),
      AbortSignal.timeout(30 * 60 * 1000),
      () => {},
    );
    await copyFile(source, join(staging, `${artifact.sha256}.bin.gz`));
  }
  await copyFile(join(root, 'config/katago/MODEL-LICENSE.txt'), join(staging, 'LICENSE.txt'));
  await copyFile(join(root, 'config/katago/artifacts.json'), join(staging, 'sources.json'));
}
await build({
  projectDir: root,
  targets: mac
    ? Platform.MAC.createTarget(['dmg'], Arch.arm64)
    : Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    directories: { output: `release/${variant}` },
    artifactName: `LLM-Go-Trainer-\${version}-${mac ? 'mac-arm64' : 'windows-x64'}-${variant}.\${ext}`,
    extraResources: variant === 'with-models' ? [{ from: staging, to: 'katago-models' }] : [],
  },
});
