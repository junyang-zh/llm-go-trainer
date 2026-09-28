import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyReleaseAssets } from './release-assets.mjs';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_REF_TYPE !== 'tag' || tag !== `v${version}`)
  throw new Error('Tag must match package.json version');
const directory = 'release-assets';
const { files: expected, checksums } = await verifyReleaseAssets(directory, version);
await writeFile(join(directory, 'SHA256SUMS.txt'), checksums);

const gh = (args) => execFileSync('gh', args, { stdio: 'inherit' });
const existing = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], {
  encoding: 'utf8',
});
if (existing.status === 0) {
  if (!JSON.parse(existing.stdout).isDraft)
    throw new Error('This release is already published; use a new version/tag');
} else {
  gh([
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--title',
    `LLM Go Trainer ${tag}`,
    '--notes-file',
    'docs/release-notes.md',
    '--generate-notes',
    ...(version.includes('-') ? ['--prerelease'] : []),
  ]);
}
// A failed build/upload never exposes a partially populated public release.
gh([
  'release',
  'upload',
  tag,
  ...expected.map((name) => join(directory, name)),
  join(directory, 'SHA256SUMS.txt'),
  '--clobber',
]);
gh([
  'release',
  'edit',
  tag,
  '--draft=false',
  ...(version.includes('-') ? ['--prerelease'] : ['--latest']),
]);
