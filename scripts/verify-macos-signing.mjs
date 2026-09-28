import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
const variant = process.argv[2];
if (!['standard', 'minimal'].includes(variant)) throw new Error('Invalid package variant');
const app = join('release', variant, 'mac-arm64', 'LLM Go Trainer.app');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
if (result.status !== 0 || !/^Authority=Developer ID Application:/m.test(result.stderr))
  throw new Error('macOS release must use a Developer ID Application signature');
// stapler requires a successful Apple notarization ticket, not merely an ad-hoc signature.
execFileSync('/usr/bin/xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
