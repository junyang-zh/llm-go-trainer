import type { ToolActivity } from '../shared/types';

const states = { running: '执行中', done: '完成', error: '失败', stopped: '已停止' };
export function AgentActivity({ tools }: { tools: ToolActivity[] }) {
  if (!tools.length) return null;
  return (
    <div className="agent-activity" aria-label="讲棋工具执行记录">
      {tools.map((tool) => (
        <details key={tool.id} className={`agent-tool ${tool.state}`}>
          <summary>
            <i aria-hidden="true" />
            <span>{tool.label}</span>
            <small>
              {states[tool.state]}
              {tool.elapsedMs !== undefined && tool.state !== 'running'
                ? ` · ${(tool.elapsedMs / 1000).toFixed(1)}s`
                : ''}
            </small>
          </summary>
          <div className="agent-tool-detail">
            {tool.baseTurn !== undefined && (
              <div>
                第 {tool.baseTurn} 手局面
                {tool.moves?.length
                  ? ` · 试下 ${tool.moves.map((move) => `${move.color === 'B' ? '黑' : '白'} ${move.point === 'pass' ? '停一手' : move.point}`).join(' → ')}`
                  : ''}
              </div>
            )}
            {tool.detail && <div>{tool.detail}</div>}
            {tool.evaluation && (
              <>
                <div>
                  黑胜率 {(tool.evaluation.winrate * 100).toFixed(1)}% · 黑目差{' '}
                  {tool.evaluation.scoreLead > 0 ? '+' : ''}
                  {tool.evaluation.scoreLead.toFixed(1)} · {tool.evaluation.visits.toLocaleString()}{' '}
                  visits
                </div>
                <div>
                  {tool.evaluation.pv
                    .map(
                      (move) =>
                        `${move.color === 'B' ? '黑' : '白'} ${move.point === 'pass' ? '停一手' : move.point}`,
                    )
                    .join(' → ')}
                </div>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
