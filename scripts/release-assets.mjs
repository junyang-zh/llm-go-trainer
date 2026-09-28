import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'js-yaml';

export function releaseAssets(version) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid release version');
  return ['windows-x64', 'mac-arm64'].flatMap((platform) =>
    ['standard', 'minimal'].map((edition) => {
      const mac = platform === 'mac-arm64';
      const base = `LLM-Go-Trainer-${version}-${platform}${edition === 'minimal' ? '-minimal' : ''}`;
      return {
        manifest: `${edition === 'minimal' ? 'minimal' : 'latest'}${mac ? '-mac' : ''}.yml`,
        files: (mac ? ['dmg', 'zip'] : ['exe']).map((ext) => `${base}.${ext}`),
      };
    }),
  );
}
async function hash(path, algorithm, encoding) {
  const value = createHash(algorithm);
  for await (const chunk of createReadStream(path)) value.update(chunk);
  return value.digest(encoding);
}
export async function verifyReleaseAssets(directory, version) {
  const groups = releaseAssets(version);
  const expected = groups.flatMap((group) => [...group.files, group.manifest]).sort();
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected all installers, macOS update ZIPs and channel manifests: ${expected.join(', ')}`,
    );
  for (const name of expected)
    if ((await stat(join(directory, name))).size === 0)
      throw new Error(`Empty release file: ${name}`);
  for (const group of groups) {
    const info = load(await readFile(join(directory, group.manifest), 'utf8'));
    if (
      info?.version !== version ||
      !Array.isArray(info.files) ||
      JSON.stringify(info.files.map((file) => file.url).sort()) !==
        JSON.stringify([...group.files].sort())
    )
      throw new Error(`Update manifest has incorrect version or edition: ${group.manifest}`);
    for (const file of info.files) {
      const path = join(directory, file.url);
      if (
        file.sha512 !== (await hash(path, 'sha512', 'base64')) ||
        file.size !== (await stat(path)).size
      )
        throw new Error(`Update checksum/size mismatch: ${file.url}`);
    }
    const legacy = info.files.find((file) => file.url === info.path);
    if (!legacy || legacy.sha512 !== info.sha512)
      throw new Error(`Invalid legacy update metadata: ${group.manifest}`);
  }
  const checksums = [];
  for (const name of expected)
    checksums.push(`${await hash(join(directory, name), 'sha256', 'hex')}  ${name}`);
  return { files: expected, checksums: checksums.join('\n') + '\n' };
}
