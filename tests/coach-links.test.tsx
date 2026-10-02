import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseCoachLink } from '../shared/coach-links';
import { MarkdownText, type CoachMarkup } from '../src/MarkdownText';
import { AgentActivity } from '../src/AgentActivity';
const coach: CoachMarkup = {
  size: 9,
  enabled: true,
  activeGroup: '1',
  disabled: false,
  select() {},
};
it('parses only bounded standard fragment links without accepting unknown or ambiguous options', () => {
  expect(parseCoachLink('#C2')).toEqual({ kind: 'point', point: 'C2' });
  expect(parseCoachLink('#go/point/B3?group=1')).toEqual({
    kind: 'point',
    point: 'B3',
    group: '1',
  });
  expect(parseCoachLink('#go/selector/1?branch=a&ply=2')).toMatchObject({
    kind: 'selector',
    group: '1',
    branch: 'a',
    ply: 2,
  });
  expect(parseCoachLink('#go/selector/review?turn=0')).toMatchObject({ turn: 0 });
  expect(parseCoachLink('1#F4#G4#G3#F4')).toEqual({
    kind: 'region',
    points: ['F4', 'G4', 'G3'],
    group: '1',
  });
  expect(parseCoachLink('#F4#G4')).toEqual({ kind: 'region', points: ['F4', 'G4'] });
  expect(parseCoachLink('#go/region/F4,G4,G3?group=one')).toEqual({
    kind: 'region',
    points: ['F4', 'G4', 'G3'],
    group: 'one',
  });
  for (const href of [
    '#I2',
    '#A0',
    '#T20',
    '#pass',
    '#go/selector/a?ply=2',
    '#go/selector/a?branch=x&turn=2',
    '#go/selector/a?turn=-1',
    '#go/selector/a?turn=1501',
    '#go/selector/a?turn=1&turn=2',
    '#go/point/B2?group=',
    '#go/point/B2?unknown=1',
    'javascript:alert(1)',
    '#go/selector/a?branch=../x',
    '1#F4',
    '1#F4#F4',
    '1#F4#I4',
    '1#F4#G20',
    '1#F4#G4?group=two',
    '#go/region/F4',
    '#go/region/F4,F4',
    '#go/region/F4,I4',
    '#go/region/F4,G4?group=',
    '#go/region/F4,G4?group=one&group=two',
    '#go/region/F4,G4?branch=line',
    `#go/region/${Array.from({ length: 362 }, (_, i) => (i % 2 ? 'F4' : 'G4')).join(',')}`,
  ])
    expect(parseCoachLink(href), href).toBeUndefined();
});
it('renders regions through Markdown without turning their coordinates into point marks or links', () => {
  const text =
    '[右下大块](1#F4#G4#G3) 不活。\n\n[常驻](#B2#B3) [关闭](2#C2#C3) [越界](1#J4#K4)\n\n`[代码](1#F4#G4)`\n\n[引用][block]\n\n[block]: #go/region/F4,G4?group=1';
  const html = renderToStaticMarkup(<MarkdownText coach={coach}>{text}</MarkdownText>);
  expect(html).toContain('data-go-region="F4 G4 G3"');
  expect(html).toContain('data-go-region="B2 B3"');
  expect(html).toContain('data-go-region="F4 G4"');
  expect(html).not.toMatch(/data-go-region="(?:C2 C3|J4 K4)"|data-go-point|href=/);
  expect(html).toContain('<code>[代码](1#F4#G4)</code>');
  for (const markup of [undefined, { ...coach, enabled: false }, { ...coach, activeGroup: '2' }]) {
    const inactive = renderToStaticMarkup(<MarkdownText coach={markup}>{text}</MarkdownText>);
    expect(inactive).not.toContain('data-go-region="F4 G4');
  }
});
it('renders only enabled in-board answer links, preserves Markdown semantics and makes selectors accessible', () => {
  const text =
    '[爬](#C2) [打](#go/point/B3?group=1) [另一个](#go/point/D3?group=2) [越界](#T19)\n\n[变化](#go/selector/1?branch=a&ply=0)\n\n`[代码](#B2)`\n\n[文档](https://example.com)';
  const html = renderToStaticMarkup(<MarkdownText coach={coach}>{text}</MarkdownText>);
  expect(html).toContain('data-go-point="C2"');
  expect(html).toContain('data-go-point="B3"');
  expect(html).not.toMatch(/data-go-point="(?:D3|T19|B2)"/);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('<code>[代码](#B2)</code>');
  expect(html).toContain('href="https://example.com"');
  expect(
    renderToStaticMarkup(<MarkdownText coach={{ ...coach, enabled: false }}>{text}</MarkdownText>),
  ).not.toContain('data-go-point');
  expect(renderToStaticMarkup(<MarkdownText>{text}</MarkdownText>)).not.toContain('data-go-point');
  expect(
    renderToStaticMarkup(
      <AgentActivity
        tools={[{ id: '1', name: 'inspect_position', label: text, detail: text, state: 'done' }]}
      />,
    ),
  ).not.toMatch(/data-go-point|coach-selector/);
});
