import { newGame, replay, toIndex, toPoint } from './go';
import type { Color, Game, Move } from './types';

export interface SgfNode {
  properties: Record<string, string[]>;
  children: SgfNode[];
}
export function parseSgf(text: string): SgfNode[] {
  if (text.length > 2_000_000) throw new Error('棋谱超过 2 MB 限制');
  text = text.replace(/^\uFEFF/, '');
  let i = 0,
    count = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
  };
  function value() {
    if (text[i++] !== '[') throw new Error('SGF 属性缺少 [');
    let result = '';
    while (i < text.length) {
      const c = text[i++];
      if (c === ']') return result;
      if (c === '\\') {
        const next = text[i++];
        if (next === '\r' && text[i] === '\n') i++;
        else if (next !== '\n' && next !== '\r' && next !== undefined) result += next;
      } else result += c;
    }
    throw new Error('SGF 属性缺少 ]');
  }
  function tree(depth: number): SgfNode {
    if (depth > 100) throw new Error('棋谱分支过深');
    ws();
    if (text[i++] !== '(') throw new Error('SGF 缺少 (');
    ws();
    let root: SgfNode | undefined, tail: SgfNode | undefined;
    while (text[i] === ';') {
      if (++count > 10000) throw new Error('棋谱节点过多');
      i++;
      ws();
      const node: SgfNode = { properties: Object.create(null), children: [] };
      while (/[A-Za-z]/.test(text[i] ?? '') && i < text.length) {
        let key = '';
        while (/[A-Za-z]/.test(text[i] ?? '') && i < text.length) key += text[i++];
        key = key.replace(/[a-z]/g, '');
        ws();
        const values: string[] = [];
        while (text[i] === '[') {
          values.push(value());
          ws();
        }
        if (!key || !values.length || node.properties[key]) throw new Error('SGF 属性无效或重复');
        node.properties[key] = values;
      }
      if (tail) tail.children.push(node);
      else root = node;
      tail = node;
    }
    if (!root || !tail) throw new Error('SGF 没有根节点');
    while (text[i] === '(') {
      tail.children.push(tree(depth + 1));
      ws();
    }
    if (text[i++] !== ')') throw new Error('SGF 缺少 )');
    return root;
  }
  const roots: SgfNode[] = [];
  ws();
  while (i < text.length) {
    roots.push(tree(0));
    ws();
  }
  if (!roots.length) throw new Error('空棋谱');
  return roots;
}
function sgfPoint(raw: string, size: number, allowPass = true): string {
  if (allowPass && (raw === '' || raw === 'tt')) return 'pass';
  if (!/^[a-s]{2}$/.test(raw)) throw new Error(`不支持的 SGF 坐标：${raw}`);
  const x = raw.charCodeAt(0) - 97,
    y = raw.charCodeAt(1) - 97;
  if (x >= size || y >= size) throw new Error('SGF 坐标超出棋盘');
  return toPoint(y * size + x, size);
}
function expandSetup(values: string[], size: number): string[] {
  return values.flatMap((value) => {
    if (!value.includes(':')) return [sgfPoint(value, size, false)];
    const [a, b, extra] = value.split(':');
    if (extra !== undefined) throw new Error('无效摆子范围');
    const start = toIndex(sgfPoint(a, size, false), size),
      end = toIndex(sgfPoint(b, size, false), size);
    if (start % size > end % size || Math.floor(start / size) > Math.floor(end / size))
      throw new Error('倒置的摆子范围');
    const points: string[] = [];
    for (let y = Math.floor(start / size); y <= Math.floor(end / size); y++)
      for (let x = start % size; x <= end % size; x++) points.push(toPoint(y * size + x, size));
    return points;
  });
}
export function importSgf(text: string): { game: Game; warnings: string[] } {
  const roots = parseSgf(text),
    root = roots[0],
    props = root.properties;
  if (props.GM && props.GM[0] !== '1') throw new Error('这不是围棋棋谱');
  const size = Number(props.SZ?.[0] ?? 19);
  if (![9, 13, 19].includes(size)) throw new Error('仅支持 9 / 13 / 19 路棋谱');
  const ru = props.RU?.[0]?.toLowerCase() ?? '';
  const rules = /japan|日本/.test(ru) ? 'japanese' : 'chinese';
  const warnings: string[] = [];
  if (!ru || !/chinese|china|中国|japan|日本/.test(ru))
    warnings.push('规则未注明或暂不支持，按中国规则导入；请核对。');
  if (roots.length > 1) warnings.push('棋谱集只导入第一局。');
  const komi = Number(props.KM?.[0] ?? (rules === 'japanese' ? 6.5 : 7.5));
  if (!Number.isFinite(komi) || Math.abs(komi) > 100 || !Number.isInteger(komi * 2))
    throw new Error('贴目必须是 -100 至 100 之间的整数或半整数');
  const game = newGame(size, 0, komi, rules);
  for (const [key, color] of [
    ['AB', 'B'],
    ['AW', 'W'],
  ] as const)
    for (const point of expandSetup(props[key] ?? [], size))
      game.initialStones.push({ color, point });
  const firstMoveColor = (() => {
    let n: SgfNode | undefined = root;
    while (n) {
      if (n.properties.B) return 'B';
      if (n.properties.W) return 'W';
      n = n.children[0];
    }
  })();
  const pl = props.PL?.[0];
  if (pl && pl !== 'B' && pl !== 'W') throw new Error('PL 行棋方无效');
  game.initialPlayer =
    (pl as Color) ?? firstMoveColor ?? (Number(props.HA?.[0] ?? 0) >= 2 ? 'W' : 'B');
  for (const key of ['PB', 'PW', 'BR', 'WR', 'DT', 'RE', 'EV', 'GN', 'AP', 'HA', 'SO', 'CP'])
    if (props[key]) game.metadata[key] = props[key][0];
  let node: SgfNode | undefined = root;
  while (node) {
    const p = node.properties;
    if (node !== root && ['AB', 'AW', 'AE', 'PL'].some((key) => p[key]))
      throw new Error('暂不支持中途摆子或修改行棋方的棋谱');
    if (p.AE) throw new Error('暂不支持含 AE 清除摆子的棋谱');
    if (p.B && p.W) throw new Error('一个节点不能同时有黑白落子');
    for (const color of ['B', 'W'] as const)
      if (p[color]) {
        if (p[color].length !== 1) throw new Error('落子属性重复');
        game.moves.push({ color, point: sgfPoint(p[color][0], size) });
      }
    if (
      node.children.length > 1 &&
      !warnings.includes('导入第一条主线，分支和原注释不进入训练记录。')
    )
      warnings.push('导入第一条主线，分支和原注释不进入训练记录。');
    node = node.children[0];
  }
  if (game.moves.length > 1500) throw new Error('棋谱超过 1500 手限制');
  replay(game); // Reject invalid games before they reach either the board or engine.
  return { game, warnings };
}
export function decodeSgf(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data),
    header = new TextDecoder('latin1').decode(bytes).slice(0, 8192);
  const charset = /CA\[([^\]]+)\]/i.exec(header)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`无法解码棋谱字符集：${charset}`);
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}
export function exportSgf(game: Game): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
  const loc = (move: Move) => {
    const i = toIndex(move.point, game.size);
    return i < 0 ? '' : String.fromCharCode(97 + (i % game.size), 97 + Math.floor(i / game.size));
  };
  let text = `(;GM[1]FF[4]CA[UTF-8]AP[llm-go-trainer:0.1]SZ[${game.size}]KM[${game.komi}]RU[${game.rules === 'chinese' ? 'Chinese' : 'Japanese'}]PL[${game.initialPlayer}]`;
  for (const [key, value] of Object.entries(game.metadata))
    if (['PB', 'PW', 'BR', 'WR', 'DT', 'RE', 'EV', 'GN', 'HA', 'SO', 'CP'].includes(key))
      text += `${key}[${esc(value)}]`;
  for (const color of ['B', 'W'] as const) {
    const stones = game.initialStones.filter((s) => s.color === color);
    if (stones.length) text += `A${color}` + stones.map((s) => `[${loc(s)}]`).join('');
  }
  return text + game.moves.map((m) => `;${m.color}[${loc(m)}]`).join('') + ')';
}
