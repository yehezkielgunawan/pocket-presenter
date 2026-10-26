export function pairingOrigin(requestUrl: string, lanHost: string) {
  const url = new URL(requestUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const validIPv4 =
    /^(\d{1,3}\.){3}\d{1,3}$/.test(lanHost) &&
    lanHost.split('.').every((part) => Number(part) <= 255);
  if (
    url.protocol === 'http:' &&
    loopback &&
    validIPv4 &&
    !lanHost.startsWith('127.') &&
    lanHost !== '0.0.0.0'
  )
    url.hostname = lanHost;
  return url.origin;
}
