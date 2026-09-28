import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownText } from '../src/MarkdownText';
import { EvaluationChart, EvaluationPanel } from '../src/EvaluationPanel';
import { recordEvaluation } from '../src/evaluation-history';
import { evaluation } from './fixtures/evaluation';

it('renders Markdown headings, emphasis, lists, tables and fenced code during streaming', () => {
  const text =
    '# 分析\n\n**弱棋**与 *厚势*\n\n- D4\n- Q16\n\n| 落点 | 目的 |\n| --- | --- |\n| D4 | 安定 |\n\n```sgf\n(;B[dd])';
  const partial = renderToStaticMarkup(<MarkdownText>{text}</MarkdownText>);
  expect(partial).toContain('<h1>分析</h1>');
  expect(partial).toContain('<strong>弱棋</strong>');
  expect(partial).toContain('<em>厚势</em>');
  expect(partial).toContain('<li>D4</li>');
  expect(partial).toContain('<table>');
  expect(partial).toContain('<pre><code class="language-sgf">');
  expect(renderToStaticMarkup(<MarkdownText>{text + '\n```\n\n后续内容'}</MarkdownText>)).toContain(
    '<p>后续内容</p>',
  );
});
it('never renders HTML scripts, remote images, or executable/local links', () => {
  const text =
    '<script>alert(1)</script>\n\n<img src="https://tracking.example/image" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) [local](file:///etc/passwd) ![图片](https://tracking.example/pixel) [文档](https://example.com/doc)';
  const html = renderToStaticMarkup(<MarkdownText>{text}</MarkdownText>);
  expect(html).not.toMatch(/<script|<img|onerror|javascript:|file:|tracking\.example/);
  expect(html).toContain('href="https://example.com/doc"');
  expect(html).toContain('rel="noreferrer noopener"');
  expect(html).toContain('target="_blank"');
});
it('keeps the graph panel present and collapsed before the first analysis', () => {
  const html = renderToStaticMarkup(
    <EvaluationPanel
      history={{}}
      turn={0}
      total={0}
      disabled={false}
      ready={false}
      completing={false}
      pendingTurn={null}
      error=""
      navigate={() => {}}
      complete={() => {}}
      stop={() => {}}
      retry={() => {}}
    />,
  );
  expect(html).toContain('目差 / 胜率');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('<svg');
});
it('renders real Black values and accessible chart navigation without fabricated empty curves', () => {
  const history = recordEvaluation({}, 'test', evaluation(1), true);
  const html = renderToStaticMarkup(
    <EvaluationChart history={history} turn={1} total={3} disabled={false} navigate={() => {}} />,
  );
  expect(html).toContain('黑胜率 20.0%，黑目差 -3.5');
  expect(html).toContain('role="button"');
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(
    renderToStaticMarkup(
      <EvaluationChart history={{}} turn={0} total={0} disabled={false} navigate={() => {}} />,
    ),
  ).not.toContain('<polyline');
});
