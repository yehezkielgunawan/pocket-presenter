import { useEffect, useRef, useState } from 'react';

const example = `# Slide 1: Introduction
- Introduce the topic.
- Explain what the audience will learn.

---

# Slide 2: Main point
- Explain the key idea.
- Give one relevant example.`;

const prompt =
  'Create speaker notes for the attached presentation as a UTF-8 Markdown file. Write exactly one section per slide, in the original slide order, including hidden slides. Separate sections using --- on its own line. Do not add a preamble, YAML front matter, or an outer code fence. Use concise speaking bullets and do not invent facts. Keep a section empty if that slide needs no notes.';

export function NotesGuide() {
  const [status, setStatus] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>(
    'idle',
  );
  const promptField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  async function copyPrompt() {
    if (copyState === 'copying') return;
    setCopyState('copying');
    setStatus('');
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
      setStatus(
        'Prompt copied. Attach your presentation when you send it to your AI tool.',
      );
    } catch {
      setCopyState('idle');
      setStatus(
        'Select and copy the prompt below. Attach your presentation when you send it to your AI tool.',
      );
      promptField.current?.focus();
      promptField.current?.select();
    }
  }
  return (
    <details className="collapse collapse-arrow min-w-0 border border-base-300 bg-base-100 text-base-content sm:col-span-2">
      <summary className="collapse-title min-h-11 font-semibold">
        How to write presentation notes
      </summary>
      <div className="collapse-content space-y-4 text-sm leading-relaxed">
        <p>
          Notes are optional for PDFs and PPTX files. PPTX uses its embedded
          notes by default. Uploaded Markdown replaces all embedded notes,
          including blank sections. Remove the Markdown file to restore embedded
          notes, or blank notes for a PDF.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Write one section per slide in presentation order, including hidden
            slides. Headings are optional; slide numbers in headings do not
            control matching.
          </li>
          <li>
            Separate sections with <code>---</code> on its own line. Leave a
            section empty to skip notes for that slide. Missing sections at the
            end stay blank; extra sections are rejected. Do not add a separator
            after the last slide.
          </li>
          <li>
            Save as a UTF-8 <code>.md</code> or <code>.markdown</code> file, up
            to 32 MB, with at most 16,000 characters per slide. Avoid YAML front
            matter and use <code>---</code> only between slides, unless it is
            inside a fenced code block.
          </li>
          <li>
            Choose your presentation, then select the notes file above. Check
            the preview before connecting your phone. Notes follow the active
            slide on your remote and are not projected on the audience screen.
          </li>
        </ol>
        <pre className="whitespace-pre-wrap break-words rounded-field bg-base-200 p-4">
          <code>{example}</code>
        </pre>
        <label className="block font-semibold" htmlFor="notes-ai-prompt">
          AI prompt
        </label>
        <p>
          Attach your PDF or PPTX to your AI tool with this prompt. Review its
          output against your slides before uploading it here.
        </p>
        <textarea
          id="notes-ai-prompt"
          ref={promptField}
          className="textarea min-h-48 w-full text-base-content"
          readOnly
          value={prompt}
        />
        <button
          type="button"
          className={`btn min-h-11 whitespace-normal ${copyState === 'copied' ? 'btn-success' : ''}`}
          disabled={copyState === 'copying'}
          aria-busy={copyState === 'copying'}
          onClick={() => void copyPrompt()}
        >
          {copyState === 'copying'
            ? 'Copying…'
            : copyState === 'copied'
              ? 'Copied!'
              : 'Copy AI prompt'}
        </button>
        <p role="status" className="break-words">
          {status}
        </p>
      </div>
    </details>
  );
}
