import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { gameSchema } from './schema';
import { presetRecord } from './presets';
import { recordGroupId } from '../shared/library';
import { replay } from '../shared/go';
import type { Conversation, Library, SavedGame } from '../shared/library';

const id = z.uuid();
const base = { id, title: z.string().max(200), updatedAt: z.iso.datetime() };
export const savedGameSchema = z.object({
  ...base,
  game: gameSchema,
  groupId: id.optional(),
  sourceId: id.optional(),
  forkTurn: z.number().int().min(0).max(1500).optional(),
});
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
          state: z.enum(['running', 'done', 'stopped', 'error', 'paused']),
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
    const game = presetRecord(gameId) ?? this.data.games.find((item) => item.id === gameId);
    if (!game) throw new Error('找不到历史棋局');
    return structuredClone(game);
  }
  saveGame(raw: unknown) {
    const record = savedGameSchema.parse(raw);
    if (record.id.startsWith('c0000000-')) throw new Error('预置棋谱只读，请保存为同源分支');
    const previous = this.data.games.find((item) => item.id === record.id);
    if (
      previous &&
      (previous.sourceId !== record.sourceId ||
        previous.groupId !== record.groupId ||
        previous.forkTurn !== record.forkTurn)
    )
      throw new Error('不能改变已有棋谱的来源');
    if (record.sourceId) {
      if (record.sourceId === record.id) throw new Error('棋谱不能以自身为来源');
      // Previously validated branches remain editable when optional source data is absent.
      const source =
        previous && record.sourceId.startsWith('c0000000-') && !presetRecord(record.sourceId)
          ? { ...previous, id: record.sourceId }
          : this.getGame(record.sourceId);
      if (record.groupId !== recordGroupId(source)) throw new Error('同源棋谱组不匹配');
      const turn = record.forkTurn;
      if (turn === undefined || turn > source.game.moves.length || turn > record.game.moves.length)
        throw new Error('分支起点超出范围');
      const { game } = record;
      if (
        game.size !== source.game.size ||
        game.rules !== source.game.rules ||
        game.komi !== source.game.komi ||
        game.initialPlayer !== source.game.initialPlayer ||
        JSON.stringify(game.initialStones) !== JSON.stringify(source.game.initialStones) ||
        JSON.stringify(game.moves.slice(0, turn)) !==
          JSON.stringify(source.game.moves.slice(0, turn))
      )
        throw new Error('分支必须保留原谱起始局面与分支前手顺');
      for (const key of ['SO', 'CP']) {
        if (source.game.metadata[key]) game.metadata[key] = source.game.metadata[key];
      }
    } else if (record.groupId || record.forkTurn !== undefined) {
      throw new Error('同源分支缺少来源棋谱');
    }
    replay(record.game);
    this.put('games', record);
    return record;
  }
  renameGame(gameId: string, name: string) {
    if (gameId.startsWith('c0000000-')) throw new Error('预置棋谱只读，请保存为同源分支');
    const title = z.string().trim().min(1).max(200).parse(name);
    const record = this.getGame(gameId);
    record.title = title;
    record.game.metadata.GN = title;
    record.updatedAt = new Date().toISOString();
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
