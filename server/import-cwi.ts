import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t as readTar } from 'tar';
import { parseSgf, importSgf, type SgfNode } from '../shared/sgf';
import { cwiArchiveUrl, type CwiIndex, type CwiRow } from '../shared/presets';

// Shared by release packaging and the on-demand source installer.
export async function importCwi(
  archive: string,
  destination: string,
  signal: AbortSignal,
  progress: (count: number) => void = () => {},
) {
  signal.throwIfAborted();
  mkdirSync(destination, { recursive: true });
  const retrievedAt = '2026-09-29T00:00:00.000Z';
  const index: CwiIndex = {
    source: cwiArchiveUrl,
    sourceSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    retrievedAt,
    files: 0,
    count: 0,
    playable: 0,
    rows: [],
  };
  const keep = new Set([
    'GM',
    'FF',
    'CA',
    'SZ',
    'KM',
    'RU',
    'HA',
    'PL',
    'AB',
    'AW',
    'AE',
    'B',
    'W',
    'PB',
    'PW',
    'BR',
    'WR',
    'DT',
    'RE',
    'EV',
    'GN',
    'RO',
    'PC',
  ]);
  const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
  const properties = (props: SgfNode['properties']) =>
    Object.entries(props)
      .filter(([key]) => keep.has(key))
      .map(([key, values]) => key + values.map((v) => `[${esc(v)}]`).join(''))
      .join('');
  let shard = 0;
  let entries: Record<string, string> = {};
  function flush() {
    if (!Object.keys(entries).length) return;
    writeFileSync(resolve(destination, `${shard}.json`), JSON.stringify(entries) + '\n');
    entries = {};
    shard++;
  }
  function record(path: string, text: string) {
    const digest = createHash('sha256').update(path).digest('hex');
    let id = `c0000000-${digest.slice(0, 4)}-5${digest.slice(4, 7)}-8${digest.slice(7, 10)}-${digest.slice(10, 22)}`;
    // Keep the IDs of the two earlier bundled records stable for existing saved branches.
    if (path === 'Shusaku/126.sgf') id = 'c0000000-0000-4000-8000-000000000001';
    if (path === 'ancient/Honinbo_Jowa/276.sgf') id = 'c0000000-0000-4000-8000-000000000002';
    let sgf = '',
      unavailable = '',
      title = path,
      size = 19,
      moves = 0,
      date = '',
      event = '';
    const warnings: string[] = [];
    try {
      const roots = parseSgf(text);
      if (roots.length !== 1) throw new Error('原文件含多局棋谱，暂不支持在棋盘打开');
      const root = roots[0];
      const p = root.properties;
      size = Number(p.SZ?.[0] ?? 19);
      date = p.DT?.[0] ?? '';
      event = p.EV?.[0] ?? '';
      title = [p.PB?.[0] || '?', 'vs', p.PW?.[0] || '?', date].join(' ').slice(0, 200);
      if (path === 'Shusaku/126.sgf') title = '耳赤之局 · 秀策 vs 幻庵因硕 · Shusaku / Gennan';
      if (path === 'ancient/Honinbo_Jowa/276.sgf')
        title = '吐血之局 · 赤星因彻 vs 本因坊丈和 · Intetsu / Jowa';
      if (!p.RU) {
        p.RU = ['Japanese'];
        warnings.push('原谱未注明规则，按日本规则复盘；日本规则终局计分未实现。');
      } else if (!/^(japanese|japan|日本|chinese|china|中国)(?:\b|$)/i.test(p.RU[0]))
        unavailable = `暂不支持原谱规则：${p.RU[0]}`;
      if (!p.KM) {
        p.KM = ['0'];
        warnings.push('原谱未注明贴目，按 SGF 默认值 0 处理。');
      }
      p.CA = ['UTF-8'];
      let node: SgfNode | undefined = root;
      sgf = '(';
      while (node) {
        sgf += ';' + properties(node.properties);
        if (node.properties.B || node.properties.W) moves++;
        node = node.children[0];
      }
      sgf += ')';
      if (!unavailable) importSgf(sgf); // Full replay through the shared legality implementation.
    } catch (error) {
      unavailable = (error as Error).message;
      // Keep malformed/unsupported files searchable and exportable, stripping annotations lexically.
      // All values are SGF-escaped; this recognizes escaped closing brackets and multi-values.
      if (!sgf)
        sgf = text
          .replace(/([A-Za-z]+)\s*((?:\[(?:\\[\s\S]|[^\\\]])*\]\s*)+)/g, (raw, key: string) =>
            keep.has(key) ? raw : '',
          )
          .trim();
    }
    const row: CwiRow = [id, path, shard, title, size, moves, date, event, unavailable, warnings];
    index.rows.push(row);
    entries[id] = sgf;
    index.count++;
    if (!unavailable) index.playable++;
    if (index.count % 1000 === 0) flush();
    if (index.count % 100 === 0) progress(index.count);
  }
  let failure: unknown;
  await readTar({
    file: archive,
    onReadEntry(entry) {
      if (entry.type !== 'File' || !entry.path.endsWith('.sgf')) {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      entry.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      entry.on('end', () => {
        if (signal.aborted || failure) return;
        try {
          index.files++;
          const data = Buffer.concat(chunks);
          const charset = /CA\[([^\]]+)\]/.exec(data.toString('latin1'))?.[1] ?? 'utf-8';
          let text: string;
          try {
            text = new TextDecoder(charset, { fatal: true }).decode(data);
          } catch {
            text = new TextDecoder('latin1').decode(data);
          }
          record(entry.path.replace(/^games\//, ''), text);
        } catch (error) {
          failure = error;
        }
      });
    },
  });
  signal.throwIfAborted();
  if (failure) throw failure;
  flush();
  const dateKey = (row: CwiRow) => /\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(row[6])?.[0] ?? '';
  index.rows.sort(
    (a, b) => dateKey(b).localeCompare(dateKey(a), 'en') || a[1].localeCompare(b[1], 'en'),
  );
  writeFileSync(resolve(destination, 'index.json'), JSON.stringify(index) + '\n');
  progress(index.count);
  return index;
}
