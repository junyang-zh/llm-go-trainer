import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const credentials = [
  'MACOS_CERTIFICATE',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY_P8',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
];
for (const name of ['RUNNER_TEMP', 'GITHUB_ENV'])
  if (!process.env[name]) throw new Error(`Missing required macOS signing configuration: ${name}`);
const missing = credentials.filter((name) => !process.env[name]);
if (missing.length) {
  await appendFile(
    process.env.GITHUB_ENV,
    'GO_TRAINER_REQUIRE_SIGNING=0\nCSC_IDENTITY_AUTO_DISCOVERY=false\n',
  );
  console.log(
    `macOS signing and notarization disabled; missing configuration: ${missing.join(', ')}`,
  );
} else {
  const directory = join(process.env.RUNNER_TEMP, 'go-trainer-signing');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const certificate = join(directory, 'developer-id.p12');
  const apiKey = join(directory, 'AuthKey.p8');
  await writeFile(certificate, Buffer.from(process.env.MACOS_CERTIFICATE, 'base64'), {
    mode: 0o600,
  });
  await writeFile(apiKey, process.env.APPLE_API_KEY_P8, { mode: 0o600 });
  await appendFile(
    process.env.GITHUB_ENV,
    `CSC_LINK=${certificate}\nAPPLE_API_KEY=${apiKey}\nGO_TRAINER_REQUIRE_SIGNING=1\n`,
  );
  console.log('macOS signing and notarization files prepared');
}
