export async function fingerprint(buffer: ArrayBuffer) {
  const hash = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
    : (await import('@noble/hashes/sha2.js')).sha256(new Uint8Array(buffer));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function fingerprintPair(first: ArrayBuffer, second: ArrayBuffer) {
  const encoded = new TextEncoder().encode(
    `${await fingerprint(first)}:${await fingerprint(second)}`,
  );
  return fingerprint(encoded.buffer as ArrayBuffer);
}
