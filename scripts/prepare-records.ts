import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { cwiSource } from '../server/cwi-source';
import { downloadArtifact } from '../server/download';
import { importCwi } from '../server/import-cwi';

export async function prepareRecords(
  directory: string,
  variant: 'standard' | 'minimal',
  source = cwiSource,
  signal = AbortSignal.timeout(30 * 60 * 1000),
) {
  // Minimal packaging must neither download nor include a cached standard catalog.
  if (variant === 'minimal') return [];
  const staging = join(directory, 'cwi.installing');
  const target = join(directory, 'cwi');
  await mkdir(directory, { recursive: true });
  await rm(staging, { recursive: true, force: true });
  try {
    const archive = await downloadArtifact(
      source.artifact,
      join(directory, 'downloads'),
      signal,
      () => {},
    );
    const index = await importCwi(archive, staging, signal);
    signal.throwIfAborted();
    if (index.count !== source.count || index.files !== source.count)
      throw new Error(`Incomplete CWI catalog: expected ${source.count}, got ${index.count}`);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    return [{ from: target, to: 'records/cwi' }];
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
