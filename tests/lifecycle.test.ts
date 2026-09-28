import { expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';

it.each(['exit', 'kill'] as const)(
  'does not orphan its analysis child when the owning app goes away (%s)',
  async (kind) => {
    const owner = spawn(
      process.execPath,
      ['--import', 'tsx', resolve('tests/fixtures/engine-owner.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true },
    );
    let output = '',
      errors = '';
    owner.stdout.setEncoding('utf8');
    owner.stdout.on('data', (text) => {
      output += text;
    });
    owner.stderr.setEncoding('utf8');
    owner.stderr.on('data', (text) => {
      errors += text;
    });
    try {
      await vi.waitFor(() => expect(output.trim(), errors).toMatch(/^\d+$/), { timeout: 5000 });
      const pid = Number(output.trim());
      const closed = once(owner, 'close');
      if (kind === 'exit') owner.stdin.end('quit');
      else owner.kill('SIGKILL');
      await closed;
      await vi.waitFor(
        () => {
          let alive = false;
          try {
            process.kill(pid, 0);
            alive = true;
          } catch {
            /* gone */
          }
          expect(alive).toBe(false);
        },
        { timeout: 5000 },
      );
    } finally {
      owner.kill('SIGKILL');
    }
  },
);
