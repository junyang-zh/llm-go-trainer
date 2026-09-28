import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { gameSchema } from './schema';
import { replay } from '../shared/go';
import type { Conversation, Library, SavedGame } from '../shared/library';

const id = z.uuid();
const base = { id, title: z.string().max(200), updatedAt: z.iso.datetime() };
export const savedGameSchema = z.object({ ...base, game: gameSchema });
export const conversationSchema = z.object({
  ...base,
  messages: z
    .array(
      z
        .object({
          id: z.string(),
          question: z.string(),
          text: z.string(),
          status: z.string(),
          state: z.enum(['running', 'done', 'stopped', 'error']),
          evaluations: z.record(z.string(), z.unknown()),
        })
        .passthrough(),
    )
    .max(10000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20000),
  draft: z.string().max(4000),
  evidence: z.unknown().optional(),
});

// A local document database: one atomic JSON record per game/conversation. No native
// database bindings are needed in Electron. Never store credentials in these records.
export class HistoryLibrary {
  private data: Library = { games: [], conversations: [] };
  constructor(private directory?: string) {
    if (!directory) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const kind of ['games', 'conversations'] as const) {
      const path = join(directory, kind);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      for (const file of readdirSync(path).filter((name) => name.endsWith('.json'))) {
        // Fail visibly on corruption instead of overwriting an unreadable library.
        const raw = JSON.parse(readFileSync(join(path, file), 'utf8'));
        if (kind === 'games') this.data.games.push(savedGameSchema.parse(raw));
        else this.data.conversations.push(conversationSchema.parse(raw) as Conversation);
      }
    }
  }
  snapshot(): Library {
    return structuredClone(this.data);
  }
  getGame(gameId: string) {
    const game = this.data.games.find((item) => item.id === gameId);
    if (!game) throw new Error('找不到历史棋局');
    return structuredClone(game);
  }
  saveGame(raw: unknown) {
    const record = savedGameSchema.parse(raw);
    replay(record.game);
    this.put('games', record);
    return record;
  }
  saveConversation(raw: unknown) {
    const record = conversationSchema.parse(raw) as Conversation;
    this.put('conversations', record);
    return record;
  }
  private put(kind: keyof Library, record: SavedGame | Conversation) {
    if (this.directory) {
      const path = join(this.directory, kind, `${record.id}.json`);
      writeFileSync(`${path}.tmp`, JSON.stringify(record), { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
    }
    const records = this.data[kind] as (SavedGame | Conversation)[];
    const index = records.findIndex((item) => item.id === record.id);
    if (index < 0) records.push(structuredClone(record));
    else records[index] = structuredClone(record);
  }
}
