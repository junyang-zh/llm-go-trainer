import { describe, expect, it } from 'vitest';
import { decodeSgf, exportSgf, importSgf, parseSgf } from '../shared/sgf';
import { newGame } from '../shared/go';

describe('SGF import/export', () => {
  it('parses escaped comments, variations, and first mainline', () => {
    const sgf =
      '(;GM[1]SZ[19]RU[Chinese]PB[野狐黑方]C[hello\\] world\\\\next];B[pd](;W[dd])(;W[pp]))';
    expect(parseSgf(sgf)[0].properties.C[0]).toBe('hello] world\\next');
    const result = importSgf(sgf);
    expect(result.game.moves).toEqual([
      { color: 'B', point: 'Q16' },
      { color: 'W', point: 'D16' },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.game.metadata.PB).toBe('野狐黑方');
  });
  it('handles handicap setup, PL, empty pass and legacy tt pass', () => {
    const { game } = importSgf('(;SZ[9]KM[0.5]RU[Japanese]HA[2]AB[cg][gc];W[];B[tt])');
    expect(game.initialStones).toHaveLength(2);
    expect(game.initialPlayer).toBe('W');
    expect(game.moves.every((m) => m.point === 'pass')).toBe(true);
  });
  it('expands compressed root setup and rejects invalid games', () => {
    expect(importSgf('(;SZ[9]RU[Chinese]AB[aa:bb])').game.initialStones).toHaveLength(4);
    for (const sgf of [
      '(;SZ[9];B[jj])',
      '(;SZ[19];B[aa];W[aa])',
      '(;SZ[19];B[aa];B[bb])',
      '(;SZ[9];AB[aa])',
      '(;SZ[9]AW[aa]AB[aa])',
      '(;SZ[19]KM[NaN])',
      '(;SZ[19]C[oops)',
    ])
      expect(() => importSgf(sgf)).toThrow();
  });
  it('round-trips handicap, metadata, rules and moves', () => {
    const game = newGame(13, 5);
    game.metadata.PB = 'Test ] \\ 名称';
    game.moves = [
      { color: 'W', point: 'A1' },
      { color: 'B', point: 'pass' },
    ];
    expect(importSgf(exportSgf(game)).game).toEqual({
      ...game,
      metadata: { ...game.metadata, AP: 'llm-go-trainer:0.1' },
    });
  });
  it('decodes UTF-8 and legacy GB18030 without corrupting names', () => {
    const utf = new TextEncoder().encode('(;SZ[19]PB[黑方])');
    expect(decodeSgf(utf.buffer)).toContain('黑方');
    // GB2312 / GB18030 bytes for 中文.
    const prefix = new TextEncoder().encode('(;CA[GB2312]SZ[19]PB['),
      suffix = new TextEncoder().encode('])');
    const gb = new Uint8Array([...prefix, 0xd6, 0xd0, 0xce, 0xc4, ...suffix]);
    expect(decodeSgf(gb.buffer)).toContain('中文');
  });
  it('parses deep variations without a call-stack limit and consumes complete input', () => {
    expect(() => parseSgf('(;SZ[19])garbage')).toThrow();
    expect(parseSgf('(;'.repeat(2000) + ')'.repeat(2000))).toHaveLength(1);
  });
  it('defaults unspecified rules to Chinese without a warning', () => {
    const { game, warnings } = importSgf('(;SZ[19];B[pd];W[dd])');
    expect(game.rules).toBe('chinese');
    expect(warnings).toEqual([]);
  });
});
