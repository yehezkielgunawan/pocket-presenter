import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { waitFor } from '@testing-library/dom';
import type { PdfDeck } from '../../src/features/deck/deckTypes';
import { openPdfDocument } from '../../src/features/deck/pdfDocument';
import { openPdfRenderer } from '../../src/features/deck/pdfRenderer';

rs.mock('../../src/features/deck/pdfDocument', () => ({
  openPdfDocument: rs.fn(),
}));

const deck: PdfDeck = {
  format: 'pdf',
  name: 'slides.pdf',
  buffer: new ArrayBuffer(0),
  fingerprint: 'a',
  slides: [
    { notes: '', hidden: false },
    { notes: '', hidden: false },
  ],
};
let resize: () => void;
let container: HTMLDivElement;
let bounds: { width: number; height: number };
let getPage: ReturnType<typeof rs.fn>;
let disconnect: ReturnType<typeof rs.fn>;
let renderer: Awaited<ReturnType<typeof openPdfRenderer>> | undefined;

beforeEach(() => {
  bounds = { width: 2000, height: 1500 };
  container = document.createElement('div');
  container.getBoundingClientRect = () => bounds as DOMRect;
  disconnect = rs.fn();
  rs.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  rs.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  getPage = rs.fn().mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 400 * scale,
      height: 200 * scale,
    }),
    render: () => ({ promise: Promise.resolve(), cancel: rs.fn() }),
  });
  rs.mocked(openPdfDocument).mockResolvedValue({
    document: { numPages: 2, getPage },
    close: rs.fn().mockResolvedValue(undefined),
  } as unknown as Awaited<ReturnType<typeof openPdfDocument>>);
});

afterEach(() => {
  renderer?.destroy();
  renderer = undefined;
  rs.restoreAllMocks();
  rs.unstubAllGlobals();
});

function canvas() {
  const element = container.querySelector('canvas');
  if (!element) throw new Error('Expected a rendered PDF canvas');
  return element;
}

test('PDF display fills the fitted area even beyond its render resolution cap', async () => {
  renderer = await openPdfRenderer(deck, container, rs.fn());
  expect(canvas().style.width).toBe('2000px');
  expect(canvas().style.height).toBe('1000px');
  expect(canvas().width).toBeLessThanOrEqual(1600);
});

test('PDF switches modes without losing the current page', async () => {
  renderer = await openPdfRenderer(deck, container, rs.fn());
  await renderer.showSlide(1);
  await renderer.setSizingMode('fill');
  expect(canvas().style.width).toBe('3000px');
  expect(canvas().style.height).toBe('1500px');
  await renderer.setSizingMode('stretch');
  expect(canvas().style.width).toBe('2000px');
  expect(canvas().style.height).toBe('1500px');
  expect(canvas().getAttribute('aria-label')).toBe('Presentation page 2');
});

test('queued PDF resizing and mode changes do not undo navigation', async () => {
  renderer = await openPdfRenderer(deck, container, rs.fn());
  const navigation = renderer.showSlide(1);
  resize();
  const changes = [
    renderer.setSizingMode('fill'),
    renderer.setSizingMode('stretch'),
  ];
  await Promise.all([navigation, ...changes]);
  expect(canvas().getAttribute('aria-label')).toBe('Presentation page 2');
  expect(canvas().style.height).toBe('1500px');
});

test('PDF defers hidden-container drawing and resizes the requested page when visible', async () => {
  bounds = { width: 0, height: 0 };
  renderer = await openPdfRenderer(deck, container, rs.fn());
  await renderer.showSlide(1);
  expect(container.childElementCount).toBe(0);
  bounds = { width: 800, height: 600 };
  resize();
  await waitFor(() =>
    expect(canvas()?.getAttribute('aria-label')).toBe('Presentation page 2'),
  );
  expect(canvas().style.width).toBe('800px');
});

test('PDF teardown disconnects resizing and ignores already queued refreshes', async () => {
  const warning = rs.fn();
  renderer = await openPdfRenderer(deck, container, warning);
  resize();
  renderer.destroy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(disconnect).toHaveBeenCalled();
  expect(container.childElementCount).toBe(0);
  expect(warning).not.toHaveBeenCalled();
});
