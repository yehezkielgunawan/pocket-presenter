import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { SpeakerNotes } from '../../src/components/SpeakerNotes';
import type { PdfDeck } from '../../src/features/deck/deckTypes';
import { NotesPreview } from '../../src/features/host/NotesPreview';

test('renders Markdown without executing HTML or unsafe URLs', () => {
  const { container } = render(
    <SpeakerNotes
      format="markdown"
      text={
        '# Intro\n\n- **Welcome**\n\n```md\n---\n```\n\n[Reference](https://example.com)\n\n[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>'
      }
    />,
  );
  expect(screen.getByRole('heading', { name: 'Intro' })).toBeInTheDocument();
  expect(container.querySelector('strong')).toHaveTextContent('Welcome');
  expect(container.querySelector('pre code')).toHaveTextContent('---');
  expect(screen.getByRole('link', { name: 'Reference' })).toHaveAttribute(
    'href',
    'https://example.com',
  );
  expect(screen.getByText('Unsafe')).not.toHaveAttribute(
    'href',
    expect.stringContaining('javascript:'),
  );
  expect(container.querySelector('script, img')).toBeNull();
});

test('keeps plain-text notes literal and handles empty notes', () => {
  const { rerender } = render(<SpeakerNotes text="**Not Markdown**" />);
  expect(screen.getByText('**Not Markdown**')).toBeInTheDocument();
  rerender(<SpeakerNotes text="   " format="markdown" />);
  expect(
    screen.getByText('No speaker notes for this slide.'),
  ).toBeInTheDocument();
});

test('preview follows the active slide and shows missing notes as empty', () => {
  const deck: PdfDeck = {
    format: 'pdf',
    name: 'slides.pdf',
    fingerprint: 'a'.repeat(64),
    buffer: new ArrayBuffer(0),
    markdownNotes: { name: 'notes.md', originalNotes: ['', ''] },
    slides: [
      { notes: '# First', hidden: false },
      { notes: '', hidden: false },
    ],
  };
  const { rerender } = render(<NotesPreview deck={deck} index={0} />);
  expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
  rerender(<NotesPreview deck={deck} index={1} />);
  expect(
    screen.queryByRole('heading', { name: 'First' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('No speaker notes for this slide.'),
  ).toBeInTheDocument();
});

test('PPTX preview keeps embedded notes literal but renders uploaded Markdown', () => {
  const deck = {
    format: 'pptx' as const,
    name: 'slides.pptx',
    fingerprint: 'a'.repeat(64),
    buffer: new ArrayBuffer(0),
    slides: [{ path: 'slide.xml', notes: '# Embedded text', hidden: false }],
  };
  const { rerender } = render(<NotesPreview deck={deck} index={0} />);
  expect(screen.getByText('# Embedded text')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Embedded text' })).toBeNull();
  rerender(
    <NotesPreview
      deck={{
        ...deck,
        markdownNotes: { name: 'notes.md', originalNotes: ['# Embedded text'] },
      }}
      index={0}
    />,
  );
  expect(
    screen.getByRole('heading', { name: 'Embedded text' }),
  ).toBeInTheDocument();
});
