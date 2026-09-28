import type { Color, Game, Move, Rules } from './types';

export const COLUMNS = 'ABCDEFGHJKLMNOPQRST';
export const other = (color: Color): Color => (color === 'B' ? 'W' : 'B');
export const toPoint = (index: number, size: number) =>
  COLUMNS[index % size] + (size - Math.floor(index / size));
export function toIndex(point: string, size: number): number {
  if (point.toLowerCase() === 'pass') return -1;
  const match = /^([A-HJ-T])(\d{1,2})$/.exec(point.toUpperCase());
  if (!match) throw new Error(`无效坐标：${point}`);
  const x = COLUMNS.indexOf(match[1]),
    y = size - Number(match[2]);
  if (x < 0 || x >= size || y < 0 || y >= size) throw new Error(`坐标超出棋盘：${point}`);
  return y * size + x;
}
export function neighbors(i: number, size: number): number[] {
  const x = i % size,
    y = Math.floor(i / size);
  return [
    x > 0 ? i - 1 : -1,
    x < size - 1 ? i + 1 : -1,
    y > 0 ? i - size : -1,
    y < size - 1 ? i + size : -1,
  ].filter((n) => n >= 0);
}
export interface Position {
  board: (Color | null)[];
  toPlay: Color;
  captures: Record<Color, number>;
  history: string[];
  passes: number;
}
export function groupAt(board: (Color | null)[], start: number, size: number) {
  const color = board[start];
  const stones = new Set<number>(),
    liberties = new Set<number>();
  if (!color) return { stones, liberties };
  const todo = [start];
  while (todo.length) {
    const i = todo.pop()!;
    if (stones.has(i)) continue;
    stones.add(i);
    for (const n of neighbors(i, size)) {
      if (!board[n]) liberties.add(n);
      else if (board[n] === color && !stones.has(n)) todo.push(n);
    }
  }
  return { stones, liberties };
}
const hash = (board: (Color | null)[]) => board.map((c) => c ?? '.').join('');
export function initialPosition(game: Game): Position {
  if (![9, 13, 19].includes(game.size)) throw new Error('仅支持 9 / 13 / 19 路棋盘');
  const board: (Color | null)[] = Array(game.size ** 2).fill(null);
  for (const stone of game.initialStones) {
    const index = toIndex(stone.point, game.size);
    if (index < 0 || board[index]) throw new Error('初始摆子重复或无效');
    board[index] = stone.color;
  }
  return {
    board,
    toPlay: game.initialPlayer,
    captures: { B: 0, W: 0 },
    history: [hash(board)],
    passes: 0,
  };
}
export function play(position: Position, move: Move, size: number, rules: Rules): Position {
  if (move.color !== position.toPlay) throw new Error('落子颜色与当前行棋方不符');
  const index = toIndex(move.point, size);
  if (index === -1)
    return {
      ...position,
      toPlay: other(move.color),
      passes: position.passes + 1,
      history: [...position.history, hash(position.board)],
    };
  if (position.board[index]) throw new Error('这里已有棋子');
  const board = [...position.board],
    captures = { ...position.captures };
  board[index] = move.color;
  for (const n of neighbors(index, size)) {
    if (board[n] !== other(move.color)) continue;
    const group = groupAt(board, n, size);
    if (group.liberties.size === 0)
      for (const stone of group.stones) {
        board[stone] = null;
        captures[move.color]++;
      }
  }
  if (groupAt(board, index, size).liberties.size === 0) throw new Error('禁止自杀落子');
  const key = hash(board);
  const repeats =
    rules === 'chinese' ? position.history.includes(key) : position.history.at(-2) === key;
  if (repeats) throw new Error('劫争：不能立即回提或重复局面');
  return {
    board,
    toPlay: other(move.color),
    captures,
    history: [...position.history, key],
    passes: 0,
  };
}
export function replay(game: Game, turn = game.moves.length): Position {
  return game.moves
    .slice(0, turn)
    .reduce((p, move) => play(p, move, game.size, game.rules), initialPosition(game));
}
export function legalPoints(game: Game, position = replay(game)): string[] {
  const points: string[] = [];
  for (let i = 0; i < position.board.length; i++) {
    if (position.board[i]) continue;
    try {
      play(
        position,
        { color: position.toPlay, point: toPoint(i, game.size) },
        game.size,
        game.rules,
      );
      points.push(toPoint(i, game.size));
    } catch {
      /* illegal point */
    }
  }
  return points;
}
export function newGame(
  size = 19,
  handicap = 0,
  komi = handicap ? 0.5 : 7.5,
  rules: Rules = 'chinese',
): Game {
  if (handicap === 1 || handicap < 0 || handicap > 9) throw new Error('让子可选 0 或 2–9 子');
  const low = size === 9 ? 2 : 3,
    high = size - 1 - low,
    mid = (size - 1) / 2;
  const points = [
    [high, low],
    [low, high],
    [high, high],
    [low, low],
  ];
  if ([5, 7, 9].includes(handicap)) points.push([mid, mid]);
  if (handicap >= 6) points.push([low, mid], [high, mid]);
  if (handicap >= 8) points.push([mid, low], [mid, high]);
  return {
    size,
    komi,
    rules,
    initialPlayer: handicap ? 'W' : 'B',
    initialStones: points
      .slice(0, handicap)
      .map(([x, y]) => ({ color: 'B', point: toPoint(y * size + x, size) })),
    moves: [],
    metadata: {},
  };
}
// Area count after user-marked dead groups are removed. Not a life-and-death solver.
export function areaScore(position: Position, size: number, komi: number, dead: number[] = []) {
  const board = [...position.board];
  for (const i of dead) board[i] = null;
  const ownership = Array<number>(size ** 2).fill(0),
    seen = new Set<number>();
  let black = 0,
    white = 0;
  board.forEach((color, i) => {
    if (color) {
      ownership[i] = color === 'B' ? 1 : -1;
      color === 'B' ? black++ : white++;
      return;
    }
    if (seen.has(i)) return;
    const region: number[] = [],
      borders = new Set<Color>(),
      todo = [i];
    while (todo.length) {
      const p = todo.pop()!;
      if (seen.has(p)) continue;
      seen.add(p);
      region.push(p);
      for (const n of neighbors(p, size)) {
        if (board[n]) borders.add(board[n]!);
        else if (!seen.has(n)) todo.push(n);
      }
    }
    if (borders.size === 1) {
      const color = [...borders][0];
      for (const p of region) ownership[p] = color === 'B' ? 1 : -1;
      color === 'B' ? (black += region.length) : (white += region.length);
    }
  });
  return { black, white, komi, lead: black - white - komi, ownership };
}
