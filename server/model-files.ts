import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadArtifact, verified, type Artifact, type DownloadProgress } from './download';

// Called under the install lock. Native KataGo needs real files outside app.asar.
export async function ensureModel(
  artifact: Artifact,
  directory: string,
  bundledModels: string | undefined,
  signal: AbortSignal,
  progress: (value: DownloadProgress) => void,
) {
  signal.throwIfAborted();
  const models = join(directory, 'models');
  const filename = `${artifact.sha256}.bin.gz`;
  const target = join(models, filename);
  if (await verified(target, artifact.sha256)) return target;
  const bundled = bundledModels && join(bundledModels, filename);
  const source =
    bundled && (await verified(bundled, artifact.sha256))
      ? bundled
      : await downloadArtifact(artifact, join(directory, 'downloads'), signal, progress);
  await mkdir(models, { recursive: true });
  const temp = target + '.tmp';
  try {
    signal.throwIfAborted();
    await copyFile(source, temp);
    if (!(await verified(temp, artifact.sha256))) throw new Error(`${artifact.name} 校验失败`);
    signal.throwIfAborted();
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
  return target;
}
