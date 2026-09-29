import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { FoxCatalog, FoxImport } from '../shared/fox';
import { gameTitle } from '../shared/library';
import { importSgf } from '../shared/sgf';
import type { HistoryLibrary } from './library';

const base = 'https://h5.foxwq.com/yehuDiamond/chessbook_local/';
const userUrl = 'https://newframe.foxwq.com/cgi/QueryUserInfoPanel';
const userAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const identifier = z.string().regex(/^\d{1,40}$/);
export const foxQuerySchema = z.object({ keyword: z.string().trim().min(1).max(100) });
export const foxImportSchema = z.object({ chessId: identifier });
const catalogSchema = z.object({
  uid: z.union([identifier, z.literal('')]),
  nickname: z.string(),
  games: z.array(
    z.object({
      chessId: identifier,
      black: z.string(),
      white: z.string(),
      date: z.string(),
      moves: z.number().optional(),
    }),
  ),
});
const scalar = z.union([z.string(), z.number().int().safe()]).optional();
const statusFields = {
  result: scalar,
  errcode: scalar,
  resultstr: z.string().optional(),
  errmsg: z.string().optional(),
};
const userSchema = z.object({
  ...statusFields,
  uid: scalar,
  username: z.string().optional(),
  name: z.string().optional(),
  englishname: z.string().optional(),
});
const itemSchema = z.object({
  chessid: scalar,
  starttime: z.string().optional(),
  dt: z.string().optional(),
  movenum: scalar,
  blacknick: z.string().optional(),
  blacknickname: z.string().optional(),
  blackname: z.string().optional(),
  blackenname: z.string().optional(),
  whitenick: z.string().optional(),
  whitenickname: z.string().optional(),
  whitename: z.string().optional(),
  whiteenname: z.string().optional(),
});
const listSchema = z.object({
  ...statusFields,
  data: z.array(itemSchema).optional(),
  chesslist: z.array(itemSchema).optional(),
});
const sgfSchema = z.object({ ...statusFields, chess: z.string().max(2_000_000).optional() });
const first = (...values: (string | undefined)[]) =>
  values.find((value) => value?.trim())?.trim() ?? '';

// Stable UUIDv8 derived from the provider and chess ID: the same game found through
// either player is imported only once, including after restarting the application.
export function foxRecordId(chessId: string) {
  const bytes = createHash('sha256').update(`fox:${chessId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class FoxRecords {
  private catalog: FoxCatalog = { uid: '', nickname: '', games: [] };
  private syncing = false;
  private downloads = new Map<string, Promise<FoxImport>>();
  constructor(
    private library: HistoryLibrary,
    private directory?: string,
    private request: typeof fetch = fetch,
  ) {
    if (directory && existsSync(join(directory, 'fox.json')))
      this.catalog = catalogSchema.parse(
        JSON.parse(readFileSync(join(directory, 'fox.json'), 'utf8')),
      );
  }
  snapshot(): FoxCatalog {
    const saved = new Set(this.library.snapshot().games.map((game) => game.id));
    return {
      ...this.catalog,
      games: this.catalog.games.map((game) => ({
        ...game,
        downloaded: saved.has(foxRecordId(game.chessId)),
      })),
    };
  }
  private async json<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    try {
      const response = await this.request(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json,text/plain,*/*' },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('empty response');
      // Bound the streamed JSON as well as the decoded SGF; do not buffer an
      // unbounded provider response in the desktop process.
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4_000_000) throw new Error('response exceeds 4 MB');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const data = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const status = data as z.infer<typeof userSchema>;
      if ([status.result, status.errcode].some((code) => code !== undefined && Number(code) !== 0))
        throw new Error(
          first(status.resultstr, status.errmsg) || `code ${status.result ?? status.errcode}`,
        );
      return data;
    } catch (error) {
      const detail = error instanceof z.ZodError ? 'invalid response' : (error as Error).message;
      throw new Error(`野狐请求失败：${detail}`);
    }
  }
  async sync(raw: unknown) {
    const { keyword } = foxQuerySchema.parse(raw);
    if (this.syncing) throw new Error('野狐查询进行中，请稍后重试');
    this.syncing = true;
    try {
      let uid = keyword,
        nickname = keyword;
      if (!/^\d+$/.test(keyword)) {
        const url = new URL(userUrl);
        url.search = new URLSearchParams({ srcuid: '0', username: keyword }).toString();
        const user = await this.json(url, userSchema);
        uid = String(user.uid ?? '');
        nickname = first(user.username, user.name, user.englishname, keyword);
      }
      if (!identifier.safeParse(uid).success) throw new Error('找不到野狐用户');
      const url = new URL('YHWQFetchChessList', base);
      url.search = new URLSearchParams({
        srcuid: '0',
        dstuid: uid,
        type: '1',
        lastcode: '0',
        searchkey: '',
        uin: uid,
      }).toString();
      const result = await this.json(url, listSchema);
      const items = result.data ?? result.chesslist;
      if (!items) throw new Error('野狐返回的对局列表无效');
      const seen = new Set<string>();
      const games = items.flatMap((item) => {
        const chessId = String(item.chessid ?? '');
        if (!identifier.safeParse(chessId).success || seen.has(chessId)) return [];
        seen.add(chessId);
        const moves = Number(item.movenum);
        return [
          {
            chessId,
            black: first(item.blacknick, item.blacknickname, item.blackname, item.blackenname),
            white: first(item.whitenick, item.whitenickname, item.whitename, item.whiteenname),
            date: first(item.starttime, item.dt),
            moves: Number.isInteger(moves) && moves >= 0 ? moves : undefined,
          },
        ];
      });
      const catalog = { uid, nickname, games };
      if (this.directory) {
        mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        const path = join(this.directory, 'fox.json');
        writeFileSync(`${path}.tmp`, JSON.stringify(catalog), { mode: 0o600 });
        renameSync(`${path}.tmp`, path);
      }
      this.catalog = catalog;
      return this.snapshot();
    } finally {
      this.syncing = false;
    }
  }
  async open(raw: unknown): Promise<FoxImport> {
    const { chessId } = foxImportSchema.parse(raw);
    const id = foxRecordId(chessId);
    const saved = this.library.snapshot().games.find((game) => game.id === id);
    if (saved) return { record: saved, warnings: [] };
    if (!this.catalog.games.some((game) => game.chessId === chessId))
      throw new Error('请先查询野狐对局列表');
    const pending = this.downloads.get(chessId);
    if (pending) return pending;
    const task = this.download(chessId).finally(() => this.downloads.delete(chessId));
    this.downloads.set(chessId, task);
    return task;
  }
  private async download(chessId: string): Promise<FoxImport> {
    const url = new URL('YHWQFetchChess', base);
    url.searchParams.set('chessid', chessId);
    const result = await this.json(url, sgfSchema);
    if (!result.chess?.trim()) throw new Error('野狐返回的棋谱为空');
    const { game, warnings } = importSgf(result.chess.trim(), 'fox');
    game.metadata.SO = `Fox · ${url}`;
    const record = this.library.saveGame({
      id: foxRecordId(chessId),
      title: gameTitle(game),
      game,
      updatedAt: new Date().toISOString(),
    });
    return { record, warnings };
  }
}
