import { expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Deck } from '../../src/features/deck/deckTypes';
import { PresentationFiles } from '../../src/features/host/PresentationFiles';

const pptx: Deck = {
  format: 'pptx',
  name: 'slides.pptx',
  fingerprint: 'a'.repeat(64),
  buffer: new ArrayBuffer(0),
  slides: [{ path: 'slide.xml', notes: 'Embedded', hidden: false }],
};

test('notes upload is optional and enabled for either presentation format', () => {
  const selectNotes = rs.fn();
  const props = {
    loading: false,
    selectPresentation: rs.fn(),
    selectNotes,
    removeNotes: rs.fn(),
  };
  const { rerender } = render(<PresentationFiles {...props} deck={null} />);
  expect(screen.getByLabelText('Presentation notes Markdown')).toBeDisabled();
  rerender(<PresentationFiles {...props} deck={pptx} />);
  expect(screen.getByLabelText('Presentation notes Markdown')).toBeEnabled();
  expect(screen.getByText(/embedded PPTX notes/i)).toBeInTheDocument();
  const file = new File(['Notes'], 'notes.md', { type: 'text/markdown' });
  fireEvent.change(screen.getByLabelText('Presentation notes Markdown'), {
    target: { files: [file] },
  });
  expect(selectNotes).toHaveBeenCalledWith(file);
  rerender(<PresentationFiles {...props} deck={{ ...pptx, format: 'pdf' }} />);
  expect(screen.getByLabelText('Presentation notes Markdown')).toBeEnabled();
  expect(screen.getByText(/present without notes/i)).toBeInTheDocument();
});

test('loaded Markdown can be removed and file operations are disabled while loading', () => {
  const removeNotes = rs.fn();
  const props = {
    deck: {
      ...pptx,
      markdownNotes: { name: 'notes.md', originalNotes: ['Embedded'] },
    },
    loading: false,
    selectPresentation: rs.fn(),
    selectNotes: rs.fn(),
    removeNotes,
  };
  const { rerender } = render(<PresentationFiles {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Markdown notes' }),
  );
  expect(removeNotes).toHaveBeenCalledTimes(1);
  rerender(<PresentationFiles {...props} loading />);
  expect(
    screen.getByRole('button', { name: 'Remove Markdown notes' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Presentation notes Markdown')).toBeDisabled();
});
