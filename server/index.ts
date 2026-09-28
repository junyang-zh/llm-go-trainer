import dotenv from 'dotenv';
import { HistoryLibrary } from './library';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { EngineManager } from './engine-manager';
import type { ProviderConfig } from './providers';
import { LlmSettings } from './llm-settings';
import { KataGoModels } from './katago-models';

const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: process.env.GO_TRAINER_ENV ?? resolve(root, '.env'), quiet: true });
function duration(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 ? n : fallback;
}
export async function startServer(port = Number(process.env.PORT ?? 3001)) {
  const directory = resolve(process.env.GO_TRAINER_DATA_DIR || resolve(root, '.local/katago'));
  const models = new KataGoModels(directory, { canSelect: !process.env.KATAGO_MODEL });
  await models.load();
  const engine = new EngineManager({
    root,
    directory,
    models,
    // Existing custom installations remain supported. Defaults need no .env file.
    configured: process.env.KATAGO_MODEL
      ? {
          executable: process.env.KATAGO_PATH || 'katago',
          model: resolve(process.env.KATAGO_MODEL),
          config: resolve(process.env.KATAGO_CONFIG || resolve(root, 'config/katago/analysis.cfg')),
          humanModel: process.env.KATAGO_HUMAN_MODEL
            ? resolve(process.env.KATAGO_HUMAN_MODEL)
            : undefined,
          timeout: duration(process.env.KATAGO_TIMEOUT_MS, 180000),
          startupTimeout: duration(
            process.env.KATAGO_STARTUP_TIMEOUT_MS,
            Math.max(duration(process.env.KATAGO_TIMEOUT_MS, 180000), 600000),
          ),
        }
      : undefined,
  });
  const providers: ProviderConfig = {
    deepseekKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    deepseekEffort: process.env.DEEPSEEK_EFFORT,
    codexModel: process.env.CODEX_MODEL,
    codexEffort: process.env.CODEX_EFFORT,
    claudeModel: process.env.CLAUDE_MODEL,
    claudeEffort: process.env.CLAUDE_EFFORT,
    codexPath: process.env.CODEX_PATH || 'codex',
    claudePath: process.env.CLAUDE_PATH || 'claude',
    codexScript: process.env.CODEX_SCRIPT,
    claudeScript: process.env.CLAUDE_SCRIPT,
    timeout: duration(process.env.LLM_TIMEOUT_MS, 120000),
  };
  const llm = new LlmSettings(
    providers,
    resolve(process.env.GO_TRAINER_SETTINGS_DIR || resolve(root, '.local/settings'), 'llm.json'),
  );
  await llm.load();
  const app = createApp(
    engine,
    providers,
    readFileSync(resolve(root, 'prompts/coach.zh-CN.md'), 'utf8'),
    resolve(root, 'dist'),
    engine,
    llm,
    new HistoryLibrary(
      resolve(process.env.GO_TRAINER_HISTORY_DIR || resolve(root, '.local/history')),
    ),
    models,
  );
  return new Promise<{
    port: number;
    close: () => Promise<void>;
    hasCachedModels: () => Promise<boolean>;
  }>((done, reject) => {
    let closing: Promise<void> | undefined;
    const server = app.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to bind server'));
        return;
      }
      // Startup is deliberately background work: the page loads while assets download and the GPU warms up.
      void engine.load();
      done({
        port: address.port,
        hasCachedModels: () => models.hasCachedModels(),
        close: () =>
          (closing ??= (async () => {
            llm.close();
            const stopped = engine.close();
            const httpClosed = new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            );
            server.closeAllConnections();
            await Promise.all([stopped, httpClosed, models.close()]);
          })()),
      });
    });
    server.on('error', reject);
  });
}
if (process.env.GO_TRAINER_EMBEDDED !== '1') {
  startServer()
    .then((server) => {
      console.log(`LLM Go Trainer: http://127.0.0.1:${server.port}`);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
        process.once(signal, () => {
          void server.close().finally(() => process.exit(0));
        });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
