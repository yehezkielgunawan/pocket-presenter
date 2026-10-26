import { PptxViewer } from '@aiden0z/pptx-renderer';
import type { Deck } from './readDeck';

export async function openRenderer(
  deck: Deck,
  container: HTMLElement,
  onWarning: (message: string) => void,
) {
  let slideError: unknown;
  const viewer = new PptxViewer(container, {
    fitMode: 'contain',
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
  } catch (error) {
    viewer.destroy();
    throw error;
  }
  return {
    async showSlide(index: number) {
      slideError = undefined;
      await viewer.renderSlide(index);
      if (slideError) throw slideError;
    },
    destroy() {
      viewer.destroy();
    },
  };
}
