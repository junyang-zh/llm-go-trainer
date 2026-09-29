import { prepareRecords } from './prepare-records';
import { tmpdir } from 'node:os';
import { cwiSource } from '../server/cwi-source';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build, Platform, Arch } from 'electron-builder';
import { downloadArtifact } from '../server/download';
import artifacts from '../config/katago/artifacts.json';
import bottles from '../config/katago/macos-bottles.json';

const edition = process.argv[2] ?? 'standard';
if (!['standard', 'minimal'].includes(edition) || process.argv.length > 3)
  throw new Error('Usage: npm run package:desktop -- [standard|minimal]');
const variant = edition as 'standard' | 'minimal';
const mac = process.platform === 'darwin' && process.arch === 'arm64';
const win = process.platform === 'win32' && process.arch === 'x64';
const requireSigning = mac && process.env.GO_TRAINER_REQUIRE_SIGNING === '1';
if (!mac && !win) throw new Error('Build on Apple Silicon macOS or Windows x64');
const bundleRuntime = variant === 'standard';
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error(`Release tag must match package.json: v${version}`);

// Stage only pinned, verified release artifacts; never package local settings or caches.
const runtimeStaging = join(root, '.local', 'release-runtime');
await rm(runtimeStaging, { recursive: true, force: true });
if (bundleRuntime) {
  await mkdir(runtimeStaging, { recursive: true });
  for (const artifact of mac ? bottles : [artifacts.windows]) {
    console.log(`Preparing ${artifact.name}`);
    const source = await downloadArtifact(
      artifact,
      join(root, '.local', 'katago', 'downloads'),
      AbortSignal.timeout(30 * 60 * 1000),
      () => {},
    );
    // Preserve the upstream archives, including dependencies and notices.
    await copyFile(source, join(runtimeStaging, artifact.sha256));
  }
  await copyFile(
    join(root, 'config/katago/KATAGO-LICENSE.txt'),
    join(runtimeStaging, 'LICENSE.txt'),
  );
  await copyFile(
    join(root, 'config/katago', mac ? 'macos-bottles.json' : 'artifacts.json'),
    join(runtimeStaging, 'sources.json'),
  );
}
const staging = join(root, '.local', 'release-models');
await rm(staging, { recursive: true, force: true });
if (variant === 'standard') {
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
const recordResources = await prepareRecords(
  join(tmpdir(), 'llm-go-trainer-records', cwiSource.artifact.sha256),
  variant,
);
await build({
  projectDir: root,
  targets: mac
    ? Platform.MAC.createTarget(['dmg', 'zip'], Arch.arm64)
    : Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    extraMetadata: { goTrainerEdition: variant },
    forceCodeSigning: requireSigning,
    mac: {
      notarize: requireSigning,
      ...(requireSigning ? {} : { identity: null }),
    },
    generateUpdatesFilesForAllChannels: false,
    detectUpdateChannel: false,
    publish: [
      {
        provider: 'github',
        owner: 'junyang-zh',
        repo: 'llm-go-trainer',
        channel: variant === 'minimal' ? 'minimal' : 'latest',
      },
    ],
    directories: { output: `release/${variant}` },
    artifactName: `LLM-Go-Trainer-\${version}-${mac ? 'mac-arm64' : 'windows-x64'}${variant === 'minimal' ? '-minimal' : ''}.\${ext}`,
    extraResources: [
      { from: join(root, '.local/icons/icon.png'), to: 'app-icon.png' },
      ...(bundleRuntime ? [{ from: runtimeStaging, to: 'katago-runtime' }] : []),
      ...(variant === 'standard' ? [{ from: staging, to: 'katago-models' }] : []),
      ...recordResources,
    ],
  },
});
