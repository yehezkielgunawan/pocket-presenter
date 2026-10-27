import Markdown from 'react-markdown';

export function SpeakerNotes({
  text,
  format = 'text',
}: {
  text: string;
  format?: 'text' | 'markdown';
}) {
  if (!text.trim()) return <p>No speaker notes for this slide.</p>;
  if (format === 'text')
    return <div className="whitespace-pre-wrap">{text}</div>;
  return (
    <div className="markdown-notes">
      <Markdown
        skipHtml
        components={{
          a: ({ node: _, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
