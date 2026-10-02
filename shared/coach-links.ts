// Standard Markdown links (fragments and compact regions); no custom lexer or raw HTML.
export type CoachLink =
  | { kind: 'point'; point: string; group?: string }
  | { kind: 'region'; points: string[]; group?: string }
  | { kind: 'selector'; group: string; branch?: string; ply?: number; turn?: number };
const identifier = /^[a-zA-Z0-9_-]{1,40}$/;
const point = /^[A-HJ-T](?:[1-9]|1[0-9])$/;
export function parseCoachLink(href: string): CoachLink | undefined {
  if (href.startsWith('#') && point.test(href.slice(1)))
    return { kind: 'point', point: href.slice(1) };
  // Compact region: [一块棋](1#P4#Q4#Q3), or (#P4#Q4#Q3) without a selector.
  const compact = /^([a-zA-Z0-9_-]{0,40})((?:#[A-HJ-T](?:[1-9]|1[0-9])){2,361})$/.exec(href);
  if (compact) {
    const points = [...new Set(compact[2].slice(1).split('#'))];
    if (points.length < 2) return;
    return { kind: 'region', points, group: compact[1] || undefined };
  }
  const match = /^#go\/(point|region|selector)\/([^?]+)(?:\?(.*))?$/.exec(href);
  if (!match) return;
  const params = new URLSearchParams(match[3]);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return;
  if (match[1] === 'point' || match[1] === 'region') {
    const group = params.get('group') ?? undefined;
    if (keys.some((key) => key !== 'group') || (group !== undefined && !identifier.test(group)))
      return;
    if (match[1] === 'point')
      return point.test(match[2]) ? { kind: 'point', point: match[2], group } : undefined;
    const coordinates = match[2].split(',');
    const points = [...new Set(coordinates)];
    if (coordinates.length > 361 || points.length < 2 || !points.every((p) => point.test(p)))
      return;
    return { kind: 'region', points, group };
  }
  if (!identifier.test(match[2]) || keys.some((key) => !['branch', 'ply', 'turn'].includes(key)))
    return;
  const branch = params.get('branch') ?? undefined;
  const ply = params.get('ply');
  const turn = params.get('turn');
  if (branch !== undefined && !identifier.test(branch)) return;
  for (const number of [ply, turn])
    if (number !== null && (!/^(0|[1-9]\d{0,3})$/.test(number) || +number > 1500)) return;
  if ((ply !== null && !branch) || (turn !== null && branch)) return;
  return {
    kind: 'selector',
    group: match[2],
    branch,
    ...(ply !== null ? { ply: +ply } : {}),
    ...(turn !== null ? { turn: +turn } : {}),
  };
}
