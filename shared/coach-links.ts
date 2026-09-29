// Standard Markdown fragment links; no custom Markdown lexer or raw HTML.
export type CoachLink =
  | { kind: 'point'; point: string; group?: string }
  | { kind: 'selector'; group: string; branch?: string; ply?: number; turn?: number };
const identifier = /^[a-zA-Z0-9_-]{1,40}$/;
const point = /^[A-HJ-T](?:[1-9]|1[0-9])$/;
export function parseCoachLink(href: string): CoachLink | undefined {
  if (href.startsWith('#') && point.test(href.slice(1)))
    return { kind: 'point', point: href.slice(1) };
  const match = /^#go\/(point|selector)\/([^?]+)(?:\?(.*))?$/.exec(href);
  if (!match) return;
  const params = new URLSearchParams(match[3]);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return;
  if (match[1] === 'point') {
    const group = params.get('group') ?? undefined;
    if (
      !point.test(match[2]) ||
      keys.some((key) => key !== 'group') ||
      (group !== undefined && !identifier.test(group))
    )
      return;
    return { kind: 'point', point: match[2], group };
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
