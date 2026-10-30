import { afterEach, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NotesGuide } from '../../src/features/host/NotesGuide';

afterEach(() => rs.useRealTimers());

test('guide includes an ordered Markdown example and a reusable AI prompt', async () => {
  const writeText = rs.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const { container } = render(<NotesGuide />);
  fireEvent.click(screen.getByText('How to write presentation notes'));
  expect(container.querySelector('pre code')?.textContent).toContain('\n---\n');
  expect(
    screen.getByText(/including hidden slides/i, { selector: 'li' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copy AI prompt' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Prompt copied');
  expect(screen.getByRole('button', { name: 'Copied!' })).toHaveClass(
    'btn-success',
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining('UTF-8 Markdown'),
  );
});

test('clipboard failure offers a selectable prompt instead', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  render(<NotesGuide />);
  fireEvent.click(screen.getByText('How to write presentation notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy AI prompt' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Select and copy the prompt below',
  );
  expect(
    (screen.getByLabelText('AI prompt') as HTMLTextAreaElement).value,
  ).toContain('one section per slide');
  expect(screen.getByRole('button', { name: 'Copy AI prompt' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
});

test('copy button shows pending feedback, prevents duplicate writes, and resets after success', async () => {
  rs.useFakeTimers();
  let finishCopy!: () => void;
  const writeText = rs.fn(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
  );
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<NotesGuide />);
  fireEvent.click(screen.getByText('How to write presentation notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy AI prompt' }));
  const pending = screen.getByRole('button', { name: 'Copying…' });
  expect(pending).toBeDisabled();
  expect(pending).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(pending);
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
  await act(async () => finishCopy());
  expect(screen.getByRole('button', { name: 'Copied!' })).toBeEnabled();
  act(() => rs.advanceTimersByTime(2500));
  expect(screen.getByRole('button', { name: 'Copy AI prompt' })).toBeEnabled();
});

test('rejected clipboard writes show fallback without claiming success', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: rs.fn().mockRejectedValue(new Error('Permission denied')),
    },
  });
  render(<NotesGuide />);
  fireEvent.click(screen.getByText('How to write presentation notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy AI prompt' }));
  expect(
    await screen.findByText(/Select and copy the prompt below/),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy AI prompt' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
});
