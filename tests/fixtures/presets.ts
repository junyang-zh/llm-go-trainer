import { beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configurePresets } from '../../server/presets';
import { writeRecordFixture } from './record-catalog.cjs';

export function useRecordFixture() {
  const fixture = { directory: '' };
  beforeAll(() => {
    fixture.directory = mkdtempSync(join(tmpdir(), 'go-record-fixture-'));
    writeRecordFixture(fixture.directory);
    configurePresets(fixture.directory);
  });
  afterAll(() => {
    configurePresets(join(fixture.directory, 'absent'));
    rmSync(fixture.directory, { recursive: true, force: true });
  });
  return fixture;
}
