import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FoxRecords, foxRecordId } from '../server/fox';
import { HistoryLibrary } from '../server/library';
import { importSgf } from '../shared/sgf';
import fixture from './fixtures/fox.json';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'fox-test-'));
  directories.push(dir);
  const library = new HistoryLibrary(dir);
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    return Response.json(
      url.includes('QueryUserInfoPanel')
        ? fixture.user
        : url.includes('FetchChessList')
          ? fixture.list
          : fixture.sgf,
    );
  });
  return { dir, library, request, fox: new FoxRecords(library, dir, request) };
}
const chessId = fixture.list.chesslist[0].chessid;

describe('Fox public records', () => {
  it('encodes usernames, preserves large chess IDs, lists without downloading and restores the list', async () => {
    const { fox, request, dir, library } = setup();
    const result = await fox.sync({ keyword: ' 棋手 &名字 ' });
    const query = new URL(String(request.mock.calls[0][0]));
    expect(query.searchParams.get('username')).toBe('棋手 &名字');
    expect(query.searchParams.get('srcuid')).toBe('0');
    const list = new URL(String(request.mock.calls[1][0]));
    expect(Object.fromEntries(list.searchParams)).toEqual({
      srcuid: '0',
      dstuid: '12345',
      type: '1',
      lastcode: '0',
      searchkey: '',
      uin: '12345',
    });
    expect(result.games[0].chessId).toBe(chessId);
    expect(result.games[1].black).toBe('WhitePlayer');
    expect(request).toHaveBeenCalledTimes(2);
    expect(library.snapshot().games).toHaveLength(0);
    expect(new FoxRecords(library, dir, request).snapshot()).toEqual(result);
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { 'User-Agent': expect.stringContaining('iPhone') },
    });
  });
  it('downloads on demand, validates, deduplicates concurrent imports and reopens offline after disk restart', async () => {
    const { fox, library, dir, request } = setup();
    await fox.sync({ keyword: '12345' });
    expect(request).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([fox.open({ chessId }), fox.open({ chessId })]);
    expect(a).toEqual(b);
    expect(a.record.game).toMatchObject({
      komi: 7.5,
      rules: 'chinese',
      moves: [
        { color: 'B', point: 'Q16' },
        { color: 'W', point: 'D4' },
      ],
    });
    expect(a.record.game.metadata.SO).toContain(chessId);
    expect(a.warnings).toHaveLength(1);
    expect(library.snapshot().games).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    library.renameGame(a.record.id, 'My review');
    request.mockRejectedValue(new Error('offline'));
    const restored = new FoxRecords(new HistoryLibrary(dir), dir, request);
    expect(restored.snapshot().games[0].downloaded).toBe(true);
    expect((await restored.open({ chessId })).record.title).toBe('My review');
    expect(request).toHaveBeenCalledTimes(2);
    expect(a.record.id).toBe(foxRecordId(chessId));
  });
  it('keeps the previous list on lookup failure and accepts an empty list', async () => {
    const { fox, request } = setup();
    const prior = await fox.sync({ keyword: '12345' });
    request.mockResolvedValueOnce(Response.json(fixture.missing));
    await expect(fox.sync({ keyword: 'missing' })).rejects.toThrow('user not found');
    expect(fox.snapshot()).toEqual(prior);
    request.mockResolvedValueOnce(Response.json({ result: 0, data: [] }));
    expect((await fox.sync({ keyword: '23456' })).games).toEqual([]);
  });
  it('rejects unknown records, invalid parameters and illegal SGFs without saving, then permits retry', async () => {
    const { fox, request, library } = setup();
    await expect(fox.sync({ keyword: ' ' })).rejects.toThrow();
    await expect(fox.open({ chessId: '../path' })).rejects.toThrow();
    await expect(fox.open({ chessId })).rejects.toThrow('请先查询');
    expect(request).not.toHaveBeenCalled();
    await fox.sync({ keyword: '12345' });
    request.mockResolvedValueOnce(Response.json(fixture.badSgf));
    await expect(fox.open({ chessId })).rejects.toThrow();
    expect(library.snapshot().games).toHaveLength(0);
    expect(fox.snapshot().games[0].downloaded).toBe(false);
    await fox.open({ chessId });
    expect(library.snapshot().games).toHaveLength(1);
  });
  it.each([
    () => new Response('unavailable', { status: 503 }),
    () => new Response('<html>error</html>'),
    () => Response.json({ result: 0 }),
    () => Response.json({ result: 0, data: [{ chessid: 1566713791010001299 }] }),
    () => new Response(' '.repeat(4_000_001)),
  ])('rejects malformed, unsafe or oversized upstream data', async (response) => {
    const { fox, request } = setup();
    request.mockResolvedValueOnce(response());
    await expect(fox.sync({ keyword: '12345' })).rejects.toThrow();
    expect(fox.snapshot().uid).toBe('');
  });
  it('reports timeout failures and releases the query lock', async () => {
    const { fox, request } = setup();
    request.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    await expect(fox.sync({ keyword: '12345' })).rejects.toThrow('timed out');
    expect((await fox.sync({ keyword: '12345' })).games).toHaveLength(2);
  });
});

describe('Fox SGF compatibility', () => {
  it('repairs only the provider root AP and known komi encoding, keeping general SGF parsing strict', () => {
    const imported = importSgf(fixture.sgf.chess, 'fox');
    expect(imported.game.komi).toBe(7.5);
    expect(imported.game.metadata.AP).toBe('GNU Go:3.8');
    expect(() => importSgf(fixture.sgf.chess)).toThrow();
    expect(() => importSgf(fixture.sgf.chess.replace('KM[375]', 'KM[999]'), 'fox')).toThrow('贴目');
    expect(() => importSgf(fixture.sgf.chess.replace('AP[foxwq];', 'KM[375];'), 'fox')).toThrow(
      '重复',
    );
    expect(importSgf(fixture.sgf.chess.replace('KM[375]', 'KM[0]'), 'fox').game.komi).toBe(0);
  });
});
