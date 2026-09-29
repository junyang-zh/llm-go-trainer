import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { cwiSourceUrl, type RecordSource } from '../shared/presets';
import { downloadArtifact, type Artifact } from './download';
import { importCwi } from './import-cwi';
import { configurePresets } from './presets';

import { cwiSource } from './cwi-source';

export class RecordSources {
  private status: RecordSource;
  private controller?: AbortController;
  private task?: Promise<void>;
  private target: string;
  constructor(
    private directory: string,
    bundled?: string,
    private artifact: Artifact = cwiSource.artifact,
  ) {
    this.target = join(directory, 'cwi');
    const included = !!bundled && existsSync(join(bundled, 'index.json'));
    const installed = existsSync(join(this.target, 'index.json'));
    configurePresets(included ? bundled! : this.target);
    this.status = {
      id: 'cwi',
      name: 'CWI · Database of Go Games',
      url: cwiSourceUrl,
      count: cwiSource.count,
      sizeBytes: cwiSource.sizeBytes,
      state: included || installed ? 'installed' : 'available',
      bundled: included,
    };
  }
  list() {
    return [structuredClone(this.status)];
  }
  start(id: string) {
    this.checkId(id);
    if (this.task || this.status.state === 'installed') return this.list();
    this.controller = new AbortController();
    this.status = {
      ...this.status,
      state: 'downloading',
      error: undefined,
      received: 0,
      total: undefined,
      processed: 0,
    };
    this.task = this.install(this.controller.signal).finally(() => {
      this.task = undefined;
    });
    return this.list();
  }
  async cancel(id: string) {
    this.checkId(id);
    this.controller?.abort();
    await this.task;
    return this.list();
  }
  async close() {
    await this.cancel('cwi');
  }
  private checkId(id: string) {
    if (id !== 'cwi') throw new Error('Unknown record source');
  }
  private async install(signal: AbortSignal) {
    const staging = join(this.directory, 'cwi.installing');
    try {
      await mkdir(this.directory, { recursive: true });
      await rm(staging, { recursive: true, force: true });
      const archive = await downloadArtifact(
        this.artifact,
        join(this.directory, 'downloads'),
        signal,
        (value) => {
          Object.assign(this.status, { received: value.received, total: value.total });
        },
      );
      signal.throwIfAborted();
      this.status.state = 'importing';
      const index = await importCwi(archive, staging, signal, (processed) => {
        this.status.processed = processed;
      });
      signal.throwIfAborted();
      // Only complete catalogs become visible. Never modify application resources.
      await rename(staging, this.target);
      configurePresets(this.target);
      this.status = { ...this.status, state: 'installed', count: index.count };
      await rm(join(this.directory, 'downloads', this.artifact.sha256), { force: true });
    } catch (error) {
      this.status.state = signal.aborted ? 'available' : 'error';
      this.status.error = signal.aborted ? undefined : (error as Error).message;
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }
}
