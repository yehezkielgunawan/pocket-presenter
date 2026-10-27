import { expect, test } from '@rstest/core';
import {
  fingerprint,
  fingerprintPair,
} from '../../src/features/deck/fingerprint';

test('returns the SHA-256 fingerprint for the exact PDF bytes', async () => {
  const bytes = new TextEncoder().encode('abc');
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );

  await expect(fingerprint(buffer)).resolves.toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('does not give the same fingerprint to different files', async () => {
  const first = new TextEncoder().encode('presentation');
  const second = new TextEncoder().encode('notes');

  await expect(fingerprint(first.buffer as ArrayBuffer)).resolves.not.toBe(
    await fingerprint(second.buffer as ArrayBuffer),
  );
});

test('fingerprints the presentation and notes as one ordered pair', async () => {
  const presentation = new TextEncoder().encode('slides').buffer as ArrayBuffer;
  const notes = new TextEncoder().encode('notes').buffer as ArrayBuffer;
  const otherNotes = new TextEncoder().encode('other notes')
    .buffer as ArrayBuffer;

  await expect(fingerprintPair(presentation, notes)).resolves.not.toBe(
    await fingerprintPair(presentation, otherNotes),
  );
  await expect(fingerprintPair(presentation, notes)).resolves.not.toBe(
    await fingerprintPair(notes, presentation),
  );
});
