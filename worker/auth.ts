export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export function sessionCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(12)),
    (byte) => alphabet[byte & 31],
  ).join('');
}
export async function hash(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}
export async function matches(value: string, expected: Uint8Array | undefined) {
  if (!expected) return false;
  return crypto.subtle.timingSafeEqual(await hash(value), expected);
}
export const cookieName = (sessionId: string, role: string) =>
  `pp_${role}_${sessionId}`;
