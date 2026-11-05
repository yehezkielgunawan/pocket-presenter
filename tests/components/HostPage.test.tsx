import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PptxDeck } from '../../src/features/deck/deckTypes';
import { readDeck } from '../../src/features/deck/readDeck';
import { openRenderer } from '../../src/features/deck/renderer';
import HostPage from '../../src/features/host/HostPage';

rs.mock('../../src/features/deck/readDeck', () => ({ readDeck: rs.fn() }));
rs.mock('../../src/features/deck/renderer', () => ({ openRenderer: rs.fn() }));

let setSizingMode: ReturnType<typeof rs.fn>;
let showSlide: ReturnType<typeof rs.fn>;
let destroy: ReturnType<typeof rs.fn>;
let deck: PptxDeck;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setSizingMode = rs.fn().mockResolvedValue(undefined);
  showSlide = rs.fn().mockResolvedValue(undefined);
  destroy = rs.fn();
  deck = {
    format: 'pptx',
    name: 'slides.pptx',
    buffer: new ArrayBuffer(1),
    fingerprint: 'a'.repeat(64),
    slides: [
      { path: 'slide1.xml', notes: '', hidden: false },
      { path: 'slide2.xml', notes: '', hidden: false },
    ],
  };
  rs.mocked(readDeck).mockImplementation(async () => ({
    ...deck,
    buffer: new ArrayBuffer(1),
  }));
  rs.mocked(openRenderer).mockResolvedValue({
    setSizingMode,
    showSlide,
    destroy,
  });
});

afterEach(() => {
  rs.restoreAllMocks();
});

async function selectDeck() {
  const file = new File(['deck'], 'slides.pptx');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new ArrayBuffer(1),
  });
  fireEvent.change(screen.getByLabelText('Presentation file'), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Fullscreen/ })).toBeEnabled(),
  );
}

test('host offers three sizing modes and applies changes without remounting or changing slides', async () => {
  render(<HostPage />);
  await selectDeck();
  const dropdown = screen.getByRole('combobox', { name: 'Slide sizing' });
  expect(dropdown).toHaveValue('fit');
  expect(
    screen.getByRole('option', { name: 'Fill (crop edges)' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'Stretch (may distort)' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
  await waitFor(() =>
    expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument(),
  );
  fireEvent.change(dropdown, { target: { value: 'fill' } });
  await waitFor(() => expect(setSizingMode).toHaveBeenLastCalledWith('fill'));
  expect(localStorage.getItem('pp.slide-sizing.v1')).toBe('fill');
  expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument();
  expect(openRenderer).toHaveBeenCalledTimes(1);
  expect(destroy).not.toHaveBeenCalled();
});

test('host restores the saved sizing and applies it to replacement decks', async () => {
  localStorage.setItem('pp.slide-sizing.v1', 'stretch');
  render(<HostPage />);
  await selectDeck();
  expect(screen.getByLabelText('Slide sizing')).toHaveValue('stretch');
  expect(setSizingMode).toHaveBeenLastCalledWith('stretch');
  await selectDeck();
  await waitFor(() => expect(openRenderer).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(setSizingMode).toHaveBeenCalledTimes(2));
  expect(setSizingMode).toHaveBeenLastCalledWith('stretch');
});

test('navigation shortcuts leave the sizing select keyboard controls alone', async () => {
  render(<HostPage />);
  await selectDeck();
  const dropdown = screen.getByRole('combobox', { name: 'Slide sizing' });
  dropdown.focus();
  expect(fireEvent.keyDown(dropdown, { key: 'End' })).toBe(true);
  await act(async () => {});
  expect(showSlide).not.toHaveBeenCalled();
});

test('unmounting during initial sizing destroys the renderer only once', async () => {
  let finishSizing = () => {};
  setSizingMode.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishSizing = resolve;
      }),
  );
  const { unmount } = render(<HostPage />);
  const file = new File(['deck'], 'slides.pptx');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new ArrayBuffer(1),
  });
  fireEvent.change(screen.getByLabelText('Presentation file'), {
    target: { files: [file] },
  });
  await waitFor(() => expect(setSizingMode).toHaveBeenCalled());
  unmount();
  await act(async () => {
    finishSizing();
  });
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('failed initial sizing reports an error and disposes the renderer', async () => {
  setSizingMode.mockRejectedValue(new Error('Sizing failed'));
  render(<HostPage />);
  const file = new File(['deck'], 'slides.pptx');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new ArrayBuffer(1),
  });
  fireEvent.change(screen.getByLabelText('Presentation file'), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Sizing failed'),
  );
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('combobox', { name: 'Slide sizing' })).toBeDisabled();
});
