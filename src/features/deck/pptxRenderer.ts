import { PptxViewer } from '@aiden0z/pptx-renderer';
import type { PptxDeck } from './deckTypes';
import { calculateSlideSizing, type SlideSizingMode } from './slideSizing';

export async function openPptxRenderer(
  deck: PptxDeck,
  container: HTMLElement,
  onWarning: (message: string) => void,
) {
  let slideError: unknown;
  let disposed = false;
  let sizingMode: SlideSizingMode = 'fit';
  let resizeObserver: ResizeObserver | null = null;
  const surface = document.createElement('div');
  surface.className = 'pptx-surface';
  container.replaceChildren(surface);
  const viewer = new PptxViewer(surface, {
    fitMode: 'none',
    externalMedia: 'block',
    pdfjs: false,
    onSlideError: (_index, error) => {
      slideError = error;
    },
    zipLimits: {
      maxEntries: 4000,
      maxEntryUncompressedBytes: 32 * 1024 * 1024,
      maxTotalUncompressedBytes: 128 * 1024 * 1024,
      maxMediaBytes: 96 * 1024 * 1024,
      maxConcurrency: 2,
    },
    onNodeError: () =>
      onWarning(
        'Some slide elements could not be rendered. Review this deck before presenting.',
      ),
  });
  function resize() {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    const size = calculateSlideSizing(
      viewer.slideWidth,
      viewer.slideHeight,
      bounds.width,
      bounds.height,
      sizingMode,
    );
    surface.style.width = `${viewer.slideWidth}px`;
    surface.style.height = `${viewer.slideHeight}px`;
    surface.style.visibility = size ? 'visible' : 'hidden';
    if (size)
      surface.style.transform = `translate(-50%, -50%) scale(${size.width / viewer.slideWidth}, ${size.height / viewer.slideHeight})`;
  }
  try {
    await viewer.open(deck.buffer, { renderMode: 'slide' });
    if (slideError) throw slideError;
    if (viewer.slideCount !== deck.slides.length)
      throw new Error('The renderer and notes disagree on slide count.');
    if (
      viewer.presentationData?.slides.some(
        (slide, index) => slide.slidePath !== deck.slides[index].path,
      )
    )
      throw new Error('The renderer and notes disagree on slide order.');
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    }
  } catch (error) {
    disposed = true;
    resizeObserver?.disconnect();
    viewer.destroy();
    surface.remove();
    throw error;
  }
  return {
    async setSizingMode(mode: SlideSizingMode) {
      sizingMode = mode;
      resize();
    },
    async showSlide(index: number) {
      slideError = undefined;
      await viewer.renderSlide(index);
      if (slideError) throw slideError;
    },
    destroy() {
      disposed = true;
      resizeObserver?.disconnect();
      viewer.destroy();
      surface.remove();
    },
  };
}
