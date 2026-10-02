import { createContext, useContext } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseCoachLink, type CoachLink } from '../shared/coach-links';
import { toIndex } from '../shared/go';

export interface CoachMarkup {
  size: number;
  enabled: boolean;
  activeGroup?: string;
  disabled: boolean;
  select: (link: Extract<CoachLink, { kind: 'selector' }>) => void;
}
const CoachContext = createContext<CoachMarkup | undefined>(undefined);
// Stable component identities preserve focus during streaming and status polling.
const components: Components = {
  a: function CoachAnchor({ href, children }) {
    const coach = useContext(CoachContext);
    const link = href && coach ? parseCoachLink(href) : undefined;
    if (link && coach) {
      if (link.kind === 'selector')
        return (
          <button
            type="button"
            className="coach-selector"
            disabled={coach.disabled}
            aria-pressed={coach.activeGroup === link.group}
            onClick={() => coach.select(link)}
          >
            {children || link.group}
          </button>
        );
      let valid = false;
      const points = link.kind === 'region' ? link.points : [link.point];
      try {
        valid = points.every((point) => toIndex(point, coach.size) >= 0);
      } catch {
        /* out of board */
      }
      const active = valid && coach.enabled && (!link.group || coach.activeGroup === link.group);
      return (
        <span
          className="coach-point"
          data-go-point={active && link.kind === 'point' ? link.point : undefined}
          data-go-region={active && link.kind === 'region' ? points.join(' ') : undefined}
          tabIndex={active ? 0 : undefined}
          title={points.join(', ')}
        >
          {children || points.join(', ')}
        </span>
      );
    }
    // Keep provider output from navigating the app or loading remote images.
    return href ? (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children }) => (
    <div className="markdown-table">
      <table>{children}</table>
    </div>
  ),
};
export function MarkdownText({ children, coach }: { children: string; coach?: CoachMarkup }) {
  return (
    <CoachContext.Provider value={coach}>
      <div className="markdown-text">
        <Markdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          urlTransform={(url) =>
            /^https?:\/\//i.test(url) || (coach && parseCoachLink(url)) ? url : ''
          }
          components={components}
        >
          {children}
        </Markdown>
      </div>
    </CoachContext.Provider>
  );
}
