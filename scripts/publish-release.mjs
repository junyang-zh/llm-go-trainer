import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_REF_TYPE !== 'tag' || tag !== `v${version}`)
  throw new Error('Tag must match package.json version');
const directory = 'release-assets';
const expected = ['windows-x64', 'mac-arm64']
  .flatMap((platform) =>
    ['standard', 'minimal'].map(
      (variant) =>
        `LLM-Go-Trainer-${version}-${platform}${variant === 'minimal' ? '-minimal' : ''}.${platform.startsWith('mac') ? 'dmg' : 'exe'}`,
    ),
  )
  .sort();
const actual = (await readdir(directory)).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error(`Expected exactly four installers: ${expected.join(', ')}`);
const checksums = [];
for (const name of expected) {
  const path = join(directory, name);
  if ((await stat(path)).size === 0) throw new Error(`Empty installer: ${name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');

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
