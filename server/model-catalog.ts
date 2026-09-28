import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LlmSettingsView } from '../shared/types';
import { effortOptions } from '../shared/llm';
export async function modelCatalog(): Promise<LlmSettingsView['models']> {
  let codex: { id: string; efforts: string[] }[] = [];
  try {
    // Read only public model metadata, never Codex auth/config files.
    const raw = JSON.parse(
      await readFile(
        join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json'),
        'utf8',
      ),
    );
    codex = (Array.isArray(raw.models) ? raw.models : [])
      .filter((model: any) => typeof model.slug === 'string' && model.visibility === 'list')
      .slice(0, 100)
      .map((model: any) => ({
        id: model.slug,
        efforts: (model.supported_reasoning_levels || [])
          .map((level: any) => level.effort)
          .filter((value: any) => effortOptions.codex.includes(value)),
      }));
  } catch {
    /* Catalog is optional: custom model IDs and CLI default remain available. */
  }
  return {
    deepseek: ['deepseek-flash', 'deepseek-v4-pro'].map((id) => ({
      id,
      efforts: [...effortOptions.deepseek],
    })),
    codex,
    claude: ['sonnet', 'opus', 'haiku'].map((id) => ({
      id,
      efforts: id === 'haiku' ? ['default'] : [...effortOptions.claude],
    })),
  };
}
