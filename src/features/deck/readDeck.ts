import JSZip from 'jszip';
import type { PptxDeck, PptxDeckSlide } from './deckTypes';
import { fingerprint } from './fingerprint';
import { MAX_FILE_BYTES, MAX_NOTES, MAX_SLIDES } from './limits';

export type { Deck, DeckSlide, PdfDeck, PptxDeck } from './deckTypes';
export { MAX_FILE_BYTES, MAX_NOTES, MAX_SLIDES } from './limits';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function xml(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('Unsupported XML declarations.');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length)
    throw new Error('Malformed presentation XML.');
  return document;
}

function resolvePart(part: string, target: string) {
  if (/[\\?#]/.test(target) || target.includes(':'))
    throw new Error('Invalid package relationship.');
  const parts = target.startsWith('/') ? [] : part.split('/').slice(0, -1);
  for (const item of target.split('/')) {
    if (!item || item === '.') continue;
    if (item === '..') {
      if (!parts.length)
        throw new Error('Relationship escapes the presentation package.');
      parts.pop();
    } else parts.push(item);
  }
  return parts.join('/');
}

function relsPath(part: string) {
  const segments = part.split('/');
  const name = segments.pop();
  return `${segments.join('/')}/_rels/${name}.rels`;
}

async function readXml(
  zip: JSZip,
  path: string,
  optional = false,
): Promise<Document | null> {
  const entry = zip.file(path);
  if (!entry) {
    if (optional) return null;
    throw new Error(`Missing presentation part: ${path}`);
  }
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const stream = entry.internalStream('uint8array');
    stream
      .on('data', (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          stream.pause();
          reject(new Error('Presentation XML exceeds the 2 MB limit.'));
        } else chunks.push(chunk);
      })
      .on('error', reject)
      .on('end', () => {
        const result = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      })
      .resume();
  });
  return xml(new TextDecoder().decode(data));
}

function relationships(document: Document | null) {
  return Array.from(
    document?.getElementsByTagNameNS('*', 'Relationship') ?? [],
  ).filter((item) => item.getAttribute('TargetMode') !== 'External');
}

function notesText(document: Document) {
  const paragraphs: string[] = [];
  for (const shape of document.getElementsByTagNameNS(P, 'sp')) {
    if (
      shape.getElementsByTagNameNS(P, 'ph')[0]?.getAttribute('type') !== 'body'
    )
      continue;
    for (const paragraph of shape.getElementsByTagNameNS(A, 'p')) {
      let text = '';
      for (const node of paragraph.getElementsByTagNameNS(A, '*')) {
        if (node.localName === 't') text += node.textContent ?? '';
        if (node.localName === 'br') text += '\n';
        if (node.localName === 'tab') text += '\t';
      }
      paragraphs.push(text);
    }
  }
  const text = paragraphs.join('\n').trim();
  if (text.length > MAX_NOTES)
    throw new Error('A slide exceeds the 16,000 character notes limit.');
  return text;
}

export async function readDeck(
  buffer: ArrayBuffer,
  name = 'Presentation.pptx',
): Promise<PptxDeck> {
  if (buffer.byteLength > MAX_FILE_BYTES)
    throw new Error('Choose a PPTX smaller than 32 MB.');
  const zip = await JSZip.loadAsync(buffer);
  if (Object.keys(zip.files).length > 4000)
    throw new Error('The presentation contains too many archive entries.');
  const presentation = await readXml(zip, 'ppt/presentation.xml');
  const rels = relationships(
    await readXml(zip, 'ppt/_rels/presentation.xml.rels'),
  );
  const ids = Array.from(
    presentation?.getElementsByTagNameNS(P, 'sldId') ?? [],
  );
  if (!ids.length || ids.length > MAX_SLIDES)
    throw new Error('Choose a presentation with 1–500 slides.');
  const slides: PptxDeckSlide[] = [];
  for (const id of ids) {
    const rel = rels.find(
      (item) => item.getAttribute('Id') === id.getAttributeNS(R, 'id'),
    );
    if (!rel?.getAttribute('Type')?.endsWith('/slide'))
      throw new Error('Missing slide relationship.');
    const path = resolvePart(
      'ppt/presentation.xml',
      rel.getAttribute('Target') ?? '',
    );
    const slide = await readXml(zip, path);
    const noteRel = relationships(
      await readXml(zip, relsPath(path), true),
    ).find((item) => item.getAttribute('Type')?.endsWith('/notesSlide'));
    const notes = noteRel
      ? await readXml(
          zip,
          resolvePart(path, noteRel.getAttribute('Target') ?? ''),
        )
      : null;
    slides.push({
      path,
      notes: notes ? notesText(notes) : '',
      hidden: slide?.documentElement.getAttribute('show') === '0',
    });
  }
  return {
    format: 'pptx',
    name,
    fingerprint: await fingerprint(buffer),
    slides,
    buffer,
  };
}
