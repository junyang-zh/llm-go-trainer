import { newGame, replay, toIndex, toPoint } from './go';
import type { Color, Game, Move } from './types';

export interface SgfNode {
  properties: Record<string, string[]>;
  children: SgfNode[];
}
export function parseSgf(text: string, source?: 'fox'): SgfNode[] {
  text = text.replace(/^\uFEFF/, '');
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  function value() {
    if (text[i++] !== '[') throw new Error('SGF 属性缺少 [');
    const parts: string[] = [];
    let start = i;
    while (i < text.length) {
      const c = text[i++];
      if (c === ']') {
        parts.push(text.slice(start, i - 1));
        return parts.join('');
      }
      if (c === '\\') {
        parts.push(text.slice(start, i - 1));
        const next = text[i++];
        if (next === '\r' && text[i] === '\n') i++;
        else if (next !== '\n' && next !== '\r' && next !== undefined) parts.push(next);
        start = i;
      }
    }
    throw new Error('SGF 属性缺少 ]');
  }
  // Explicit frames avoid call-stack and arbitrary size/depth limits for collections.
  const stack: { root?: SgfNode; tail?: SgfNode; variations: boolean }[] = [];
  const roots: SgfNode[] = [];
  ws();
  while (i < text.length) {
    const frame = stack.at(-1);
    const c = text[i++];
    if (c === '(') {
      if (frame && !frame.tail) throw new Error('SGF 没有根节点');
      stack.push({ variations: false });
    } else if (c === ';') {
      if (!frame) throw new Error('SGF 缺少 (');
      if (frame.variations) throw new Error('SGF 缺少 )');
      ws();
      const node: SgfNode = { properties: Object.create(null), children: [] };
      while (i < text.length && /[A-Za-z]/.test(text[i])) {
        let key = '';
        while (i < text.length && /[A-Za-z]/.test(text[i])) key += text[i++];
        key = key.replace(/[a-z]/g, '');
        ws();
        const values: string[] = [];
        while (text[i] === '[') {
          values.push(value());
          ws();
        }
        const foxApplication =
          source === 'fox' && stack.length === 1 && !frame.root && key === 'AP';
        if (!key || !values.length || (node.properties[key] && !foxApplication))
          throw new Error('SGF 属性无效或重复');
        node.properties[key] = foxApplication
          ? [...(node.properties[key] ?? []), ...values]
          : values;
      }
      if (frame.tail) frame.tail.children.push(node);
      else frame.root = node;
      frame.tail = node;
    } else if (c === ')') {
      if (!frame) throw new Error('SGF 缺少 (');
      if (!frame.root) throw new Error('SGF 没有根节点');
      stack.pop();
      const parent = stack.at(-1);
      if (parent) {
        parent.tail!.children.push(frame.root);
        parent.variations = true;
      } else roots.push(frame.root);
    } else throw new Error(frame ? 'SGF 缺少 )' : 'SGF 缺少 (');
    ws();
  }
  if (stack.length) throw new Error('SGF 缺少 )');
  if (!roots.length) throw new Error('空棋谱');
  return roots;
}
export function sgfPoint(raw: string, size: number, allowPass = true): string {
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
export function importSgf(text: string, source?: 'fox'): { game: Game; warnings: string[] } {
  const roots = parseSgf(text, source),
    root = roots[0],
    props = root.properties;
  if (props.GM && props.GM[0] !== '1') throw new Error('这不是围棋棋谱');
  const size = Number(props.SZ?.[0] ?? 19);
  if (![9, 13, 19].includes(size)) throw new Error('仅支持 9 / 13 / 19 路棋谱');
  const ru = props.RU?.[0]?.toLowerCase() ?? '';
  const rules = /japan|日本/.test(ru) ? 'japanese' : 'chinese';
  const warnings: string[] = [];
  if (roots.length > 1) warnings.push('棋谱集只导入第一局。');
  let komi = Number(props.KM?.[0] ?? (rules === 'japanese' ? 6.5 : 7.5));
  // Fox's Chinese KM[375] is hundredths of a stone: 3.75 stones = 7.5 points.
  // Restrict repair to the known provider encoding; unknown values still fail validation.
  if (source === 'fox' && /chinese|china|中国/.test(ru) && komi === 375) {
    komi = 7.5;
    warnings.push('已将野狐贴子值 KM[375] 转换为贴目 7.5。');
  }
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
export function sgfProperties(properties: SgfNode['properties']) {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
  return Object.entries(properties)
    .map(([key, values]) => key + values.map((value) => `[${escape(value)}]`).join(''))
    .join('');
}
export function serializeSgf(roots: SgfNode[]): string {
  const parts: string[] = [];
  const stack: (SgfNode | string)[] = [];
  for (const root of [...roots].reverse()) stack.push(')', root, '(');
  while (stack.length) {
    const item = stack.pop()!;
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }
    parts.push(';' + sgfProperties(item.properties));
    if (item.children.length === 1) stack.push(item.children[0]);
    else for (const child of [...item.children].reverse()) stack.push(')', child, '(');
  }
  return parts.join('');
}

// A study tree can replace a diagram midway through a variation. Keep that
// operation separate from ordinary game import, which rejects mid-game setup.
// Each replacement starts a new position; subsequent moves still use replay().
export function importSgfDiagramPath(path: SgfNode[]): { game: Game; warnings: string[] } {
  if (!path.length) throw new Error('SGF 没有根节点');
  let game: Game | undefined;
  let segment: SgfNode[] = [];
  const warnings = new Set<string>();
  function flush() {
    const imported = importSgf(
      '(' + segment.map((node) => ';' + sgfProperties(node.properties)).join('') + ')',
    );
    game = imported.game;
    imported.warnings.forEach((warning) => warnings.add(warning));
  }
  for (let index = 0; index < path.length; index++) {
    const properties = path[index].properties;
    if (['AB', 'AW', 'AE', 'PL'].some((key) => properties[key])) {
      if (segment.length) flush();
      const size = game?.size ?? Number(path[0].properties.SZ?.[0] ?? 19);
      const board = game ? [...replay(game).board] : Array<Color | null>(size * size).fill(null);
      for (const point of expandSetup(properties.AE ?? [], size))
        board[toIndex(point, size)] = null;
      for (const color of ['B', 'W'] as const)
        for (const point of expandSetup(properties[`A${color}`] ?? [], size))
          board[toIndex(point, size)] = color;
      const nextColor = path.slice(index).find((node) => node.properties.B || node.properties.W);
      const player =
        properties.PL?.[0] ??
        (nextColor ? (nextColor.properties.B ? 'B' : 'W') : game ? replay(game).toPlay : 'B');
      const rootProperties: SgfNode['properties'] = { ...path[0].properties, PL: [player] };
      for (const key of ['AB', 'AW', 'AE', 'B', 'W']) delete rootProperties[key];
      for (const color of ['B', 'W'] as const) {
        const points = board.flatMap((stone, point) =>
          stone === color
            ? [String.fromCharCode(97 + (point % size), 97 + Math.floor(point / size))]
            : [],
        );
        if (points.length) rootProperties[`A${color}`] = points;
      }
      segment = [{ properties: rootProperties, children: [] }];
      const remainder = { ...properties };
      for (const key of ['AB', 'AW', 'AE', 'PL']) delete remainder[key];
      segment.push({ properties: remainder, children: [] });
    } else segment.push({ properties, children: [] });
  }
  flush();
  return { game: game!, warnings: [...warnings] };
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
