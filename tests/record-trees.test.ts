import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { parseSgf, importSgfDiagramPath, serializeSgf } from '../shared/sgf';
import { replay, toIndex } from '../shared/go';
import { HistoryLibrary } from '../server/library';
import { createApp } from '../server/app';
import { KataGo } from '../server/katago';
import { largeCommentSgf, longTreeSgf, collectionSgf } from './fixtures/sgf-trees';
import type { SavedGame } from '../shared/library';

let directory: string;
let library: HistoryLibrary;
let record: SavedGame;
let server: Server | undefined;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'study-import-'));
  library = new HistoryLibrary(directory);
  record = library.importSgf(
    readFileSync('tests/fixtures/study-tree.sgf', 'utf8'),
    '测试定式树.sgf',
  );
});
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
  }
  rmSync(directory, { recursive: true, force: true });
});
it('stores one history entry and browses siblings without losing comments or marks', () => {
  expect(library.snapshot().games).toHaveLength(1);
  expect(record).toMatchObject({ title: '测试定式树', tree: true });
  expect(JSON.stringify(library.snapshot())).not.toContain('原谱注释');
  const root = library.recordTree(record.id)!;
  expect(root.children.map((child) => child.title)).toEqual(['星', '另一个角']);
  const star = library.recordTree(root.children[0].id)!;
  const approach = library.recordTree(star.children[0].id)!;
  expect(approach.comment).toBe('原谱注释');
  expect(approach.annotations).toEqual({ TR: ['pd'], LB: ['qf:A'] });
  expect(approach.children.map((child) => child.title)).toEqual(['单关', '小飞', '非法颜色']);
  for (const child of approach.children.slice(0, 2)) {
    const page = library.recordTree(child.id)!;
    expect(page.record!.game.moves).toHaveLength(3);
    expect(page.breadcrumbs.at(-2)!.id).toBe(approach.id);
    expect(library.getGame(child.id).game).toEqual(page.record!.game);
  }
  expect(library.recordTree(approach.children[2].id)!.unavailable).toContain('颜色');
  expect(library.recordTree(record.id.slice(0, 24) + '999999999999')).toBeUndefined();
  expect(library.snapshot().games).toHaveLength(1);
});
it('handles mid-variation setup and removal with shared rules and legal moves afterward', () => {
  let page = library.recordTree(record.id)!;
  page = library.recordTree(page.children[1].id)!;
  page = library.recordTree(page.children[0].id)!;
  page = library.recordTree(page.children[0].id)!;
  const position = replay(page.record!.game);
  expect(position.board[toIndex('D4', 19)]).toBeNull();
  expect(position.board[toIndex('D16', 19)]).toBe('B');
  expect(position.board[toIndex('Q4', 19)]).toBe('W');
  expect(page.record!.game.moves).toEqual([]);
  const next = library.recordTree(page.children[0].id)!;
  expect(next.record!.game.moves).toEqual([{ color: 'B', point: 'C16' }]);
  expect(() => replay(next.record!.game)).not.toThrow();
});
it('exports all branches/annotations, protects the source, allows rename and preserves lineage after restart', () => {
  const text = library.exportSgf(record.id);
  const root = parseSgf(text)[0];
  expect(root.children).toHaveLength(2);
  expect(root.properties.CA).toEqual(['UTF-8']);
  expect(text).toContain('C[原谱注释]TR[pd]LB[qf:A]');
  const star = library.recordTree(record.id)!.children[0].id;
  expect(parseSgf(library.exportSgf(star))[0].children[0].children).toEqual([]);
  const original = library.getGame(star);
  expect(() => library.saveGame(original)).toThrow('只读');
  expect(() => library.saveGame({ ...record, tree: undefined })).toThrow('只读');
  expect(() => library.renameGame(star, '不可改变化')).toThrow('只读');
  const branch = library.saveGame({
    id: '12345678-1234-4123-8123-123456789012',
    title: '分支',
    updatedAt: record.updatedAt,
    game: original.game,
    groupId: record.id,
    sourceId: star,
    forkTurn: 1,
  });
  library.renameGame(record.id, '改名后的定式树');
  library = new HistoryLibrary(directory);
  expect(library.getGame(record.id).title).toBe('改名后的定式树');
  expect(library.recordTree(star)!.record!.title).toContain('改名后的定式树');
  expect(library.getGame(branch.id).sourceId).toBe(star);
  expect(library.recordTree(record.id)!.children).toHaveLength(2);
  original.game.moves.length = 0;
  expect(library.getGame(star).game.moves).toHaveLength(1);
});
it('accepts large comments and long/deep trees without former character, node or depth limits', () => {
  const large = library.importSgf(largeCommentSgf(), '大文件.sgf');
  expect(library.recordTree(large.id)!.comment).toHaveLength(2_000_001);
  const long = library.importSgf(longTreeSgf(), '多节点.sgf');
  expect(long.treeNodes).toBe(20001);
  expect(() => serializeSgf(parseSgf(longTreeSgf()))).not.toThrow();
  const root = parseSgf('(;SZ[19]AB[dd]AW[pp];AE[dd];W[cd])')[0];
  const game = importSgfDiagramPath([root, root.children[0], root.children[0].children[0]]).game;
  expect(game.initialStones).toEqual([{ color: 'W', point: 'Q4' }]);
});
it('keeps a multi-game collection as one file entry with each game’s board size and turn', () => {
  const imported = library.importSgf(collectionSgf, '棋谱集.sgf');
  const root = library.recordTree(imported.id)!;
  expect(root.children.map((child) => child.title)).toEqual(['九路', '十三路']);
  let page = library.recordTree(root.children[1].id)!;
  page = library.recordTree(page.children[0].id)!;
  expect(page.record!.game.size).toBe(13);
  expect(page.record!.game.initialPlayer).toBe('W');
  expect(parseSgf(library.exportSgf(imported.id))).toHaveLength(2);
});
it('serves unlimited import, history tree cursors and full export through the local API', async () => {
  const engine = new KataGo({
    executable: 'absent',
    model: 'absent',
    config: 'absent',
    timeout: 3000,
  });
  const app = createApp(
    engine,
    {
      deepseekKey: '',
      deepseekUrl: 'https://api.deepseek.com',
      deepseekModel: 'test',
      timeout: 3000,
      codexPath: 'absent',
      claudePath: 'absent',
    },
    '',
    directory,
    undefined,
    undefined,
    library,
  );
  server = createServer(app);
  await new Promise<void>((done, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', done);
  });
  const port = (server.address() as { port: number }).port;
  const get = (path: string) => fetch(`http://127.0.0.1:${port}/api/library${path}`);
  // Exceeds both the old 2 MB client/parser limit and the library's 32 MB JSON limit.
  const response = await fetch(`http://127.0.0.1:${port}/api/library/import-sgf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1' },
    body: JSON.stringify({ filename: '超大文件.sgf', sgf: largeCommentSgf(33 * 1024 * 1024) }),
  });
  expect(response.status).toBe(200);
  const imported = await response.json();
  expect(imported).toMatchObject({ tree: true, title: '超大文件' });
  expect((await (await get(`/games/${record.id}/tree`)).json()).children).toHaveLength(2);
  const exported = await (await get(`/games/${record.id}/sgf`)).json();
  expect(exported.sgf).toContain('原谱注释');
  expect(exported.sgf).not.toContain('CWI');
  expect((await get(`/games/${record.id.slice(0, 24)}999999999999/tree`)).status).toBe(404);
  expect((await (await get('/presets?category=joseki')).json()).total).toBe(0);
}, 30000);
