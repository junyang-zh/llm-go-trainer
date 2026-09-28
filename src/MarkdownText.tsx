import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownText({ children }: { children: string }) {
  return (
    <div className="markdown-text">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          // Keep provider output from navigating the app or loading remote images.
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
          table: ({ children }) => (
            <div className="markdown-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
