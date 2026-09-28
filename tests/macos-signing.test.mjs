import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let directory;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function prepare(credentials = {}) {
  directory = await mkdtemp(join(tmpdir(), 'go-signing-'));
  const envFile = join(directory, 'environment');
  const output = execFileSync(process.execPath, [resolve('scripts/prepare-macos-signing.mjs')], {
    env: { RUNNER_TEMP: directory, GITHUB_ENV: envFile, ...credentials },
    encoding: 'utf8',
  });
  return { output, env: await readFile(envFile, 'utf8') };
}

it.each([{}, { MACOS_CERTIFICATE: 'partial-certificate' }])(
  'continues without signing and writes no credential files when configuration is incomplete: %j',
  async (credentials) => {
    const result = await prepare(credentials);
    expect(result.env).toContain('GO_TRAINER_REQUIRE_SIGNING=0\n');
    expect(result.env).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false\n');
    expect(result.env).not.toContain('CSC_LINK=');
    expect(await readdir(directory)).toEqual(['environment']);
    expect(result.output).toContain('signing and notarization disabled');
    expect(result.output).not.toContain('partial-certificate');
  },
);

it('requires signing when all credentials are supplied and stores private files without logging values', async () => {
  const certificate = 'test certificate bytes';
  const key = 'test private key bytes';
  const result = await prepare({
    MACOS_CERTIFICATE: Buffer.from(certificate).toString('base64'),
    CSC_KEY_PASSWORD: 'test-password',
    APPLE_API_KEY_P8: key,
    APPLE_API_KEY_ID: 'test-key-id',
    APPLE_API_ISSUER: 'test-issuer',
  });
  const certPath = join(directory, 'go-trainer-signing', 'developer-id.p12');
  const keyPath = join(directory, 'go-trainer-signing', 'AuthKey.p8');
  expect(result.env).toContain('GO_TRAINER_REQUIRE_SIGNING=1\n');
  expect(result.env).toContain(`CSC_LINK=${certPath}\n`);
  expect(result.env).toContain(`APPLE_API_KEY=${keyPath}\n`);
  expect(await readFile(certPath, 'utf8')).toBe(certificate);
  expect(await readFile(keyPath, 'utf8')).toBe(key);
  if (process.platform !== 'win32') {
    expect((await stat(certPath)).mode & 0o777).toBe(0o600);
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  }
  for (const value of [certificate, key, 'test-password', 'test-key-id', 'test-issuer']) {
    expect(result.output).not.toContain(value);
    expect(result.env).not.toContain(value);
  }
});
