import { PptxViewer } from '@aiden0z/pptx-renderer';
import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import type { PptxDeck } from '../../src/features/deck/deckTypes';
import { openPptxRenderer } from '../../src/features/deck/pptxRenderer';

rs.mock('@aiden0z/pptx-renderer', () => ({ PptxViewer: rs.fn() }));

const deck: PptxDeck = {
  format: 'pptx',
  name: 'slides.pptx',
  buffer: new ArrayBuffer(0),
  fingerprint: 'a',
  slides: [
    { path: 'slide1.xml', notes: '', hidden: false },
    { path: 'slide2.xml', notes: '', hidden: false },
  ],
};
let container: HTMLDivElement;
let bounds: { width: number; height: number };
let resize: () => void;
let disconnect: ReturnType<typeof rs.fn>;
let renderSlide: ReturnType<typeof rs.fn>;
let destroy: ReturnType<typeof rs.fn>;
let renderer: Awaited<ReturnType<typeof openPptxRenderer>> | undefined;

beforeEach(() => {
  bounds = { width: 800, height: 600 };
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
  renderSlide = rs.fn().mockResolvedValue(undefined);
  destroy = rs.fn();
  rs.mocked(PptxViewer).mockImplementation(
    () =>
      ({
        open: rs.fn().mockResolvedValue(undefined),
        slideCount: 2,
        slideWidth: 400,
        slideHeight: 200,
        presentationData: {
          slides: [{ slidePath: 'slide1.xml' }, { slidePath: 'slide2.xml' }],
        },
        renderSlide,
        destroy,
      }) as unknown as PptxViewer,
  );
});

afterEach(() => {
  renderer?.destroy();
  renderer = undefined;
  rs.restoreAllMocks();
  rs.unstubAllGlobals();
});

test('PPTX uses an intrinsic-size surface and transforms it for every mode', async () => {
  renderer = await openPptxRenderer(deck, container, rs.fn());
  const surface = container.querySelector<HTMLElement>('.pptx-surface');
  if (!surface) throw new Error('Expected an intrinsic-size PPTX surface');
  expect(surface.style.width).toBe('400px');
  expect(surface.style.height).toBe('200px');
  expect(surface.style.transform).toBe('translate(-50%, -50%) scale(2, 2)');
  await renderer.setSizingMode('fill');
  expect(surface.style.transform).toBe('translate(-50%, -50%) scale(3, 3)');
  await renderer.setSizingMode('stretch');
  expect(surface.style.transform).toBe('translate(-50%, -50%) scale(2, 3)');
});

test('PPTX resizing and mode changes do not rerender or reset the active slide', async () => {
  renderer = await openPptxRenderer(deck, container, rs.fn());
  await renderer.showSlide(1);
  await renderer.setSizingMode('stretch');
  bounds = { width: 1600, height: 900 };
  resize();
  expect(
    container.querySelector<HTMLElement>('.pptx-surface')?.style.transform,
  ).toBe('translate(-50%, -50%) scale(4, 4.5)');
  expect(renderSlide).toHaveBeenCalledTimes(1);
  expect(renderSlide).toHaveBeenCalledWith(1);
});

test('PPTX teardown removes the surface and disconnects its resize observer', async () => {
  renderer = await openPptxRenderer(deck, container, rs.fn());
  renderer.destroy();
  renderer = undefined;
  resize();
  expect(container.childElementCount).toBe(0);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});
