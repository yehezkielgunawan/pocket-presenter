import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

let worker: Worker | null = null;

function pdfWorker() {
  if (!GlobalWorkerOptions.workerPort) {
    worker ??= new PdfWorker({ name: 'pdf-document-worker' });
    GlobalWorkerOptions.workerPort = worker;
  }
}

export async function openPdfDocument(buffer: ArrayBuffer) {
  pdfWorker();
  const task: PDFDocumentLoadingTask = getDocument({
    data: buffer.slice(0),
  });
  try {
    const document = await task.promise;
    return {
      document,
      close: () => task.destroy(),
    } satisfies LoadedPdf;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw error;
  }
}

export interface LoadedPdf {
  document: PDFDocumentProxy;
  close: () => Promise<void>;
}
