/** getRandomValues remains available on HTTP LAN origins, unlike randomUUID. */
export function commandId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
