import type { RenderTask } from 'pdfjs-dist';
import type { PdfDeck } from './deckTypes';
import { openPdfDocument } from './pdfDocument';

export async function openPdfRenderer(
  deck: PdfDeck,
  container: HTMLElement,
  onWarning: (message: string) => void,
) {
  const loaded = await openPdfDocument(deck.buffer);
  if (loaded.document.numPages !== deck.slides.length) {
    await loaded.close();
    throw new Error('The PDF renderer and slide count disagree.');
  }

  let disposed = false;
  let renderTask: RenderTask | null = null;
  let renderQueue = Promise.resolve();
  let currentIndex = 0;
  let resizeObserver: ResizeObserver | null = null;
  container.classList.add('pdf-stage');

  async function drawSlide(index: number) {
    if (disposed) throw new Error('The PDF renderer has been closed.');
    if (!Number.isInteger(index) || index < 0 || index >= deck.slides.length)
      throw new Error('The requested PDF page does not exist.');

    const page = await loaded.document.getPage(index + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const bounds = container.getBoundingClientRect();
    const fitScale = Math.min(
      bounds.width / baseViewport.width,
      bounds.height / baseViewport.height,
    );
    const scale = Math.max(0.1, Math.min(fitScale || 1, 2));
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create a PDF canvas.');
    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Presentation page ${index + 1}`);

    const nextTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform:
        outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      background: '#ffffff',
    });
    renderTask = nextTask;
    try {
      await nextTask.promise;
    } finally {
      if (renderTask === nextTask) renderTask = null;
    }
    if (!disposed) {
      container.replaceChildren(canvas);
      currentIndex = index;
    }
  }

  function showSlide(index: number) {
    const operation = renderQueue.then(() => drawSlide(index));
    renderQueue = operation.catch(() => undefined);
    return operation;
  }

  try {
    await showSlide(0);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        void showSlide(currentIndex).catch((error: unknown) =>
          onWarning(
            error instanceof Error
              ? error.message
              : 'The PDF page could not be resized.',
          ),
        );
      });
      resizeObserver.observe(container);
    }
  } catch (error) {
    disposed = true;
    resizeObserver?.disconnect();
    container.classList.remove('pdf-stage');
    await loaded.close();
    throw error;
  }

  return {
    showSlide,
    destroy() {
      disposed = true;
      resizeObserver?.disconnect();
      renderTask?.cancel();
      container.replaceChildren();
      container.classList.remove('pdf-stage');
      void loaded.close().catch(() => undefined);
    },
  };
}
