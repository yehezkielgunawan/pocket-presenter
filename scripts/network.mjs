import { isIPv4 } from 'node:net';

export function selectLanAddress(interfaces, preferred) {
  if (preferred) {
    if (
      !isIPv4(preferred) ||
      preferred.startsWith('127.') ||
      preferred === '0.0.0.0'
    )
      throw new Error(
        'LAN_IP must be a reachable IPv4 address of this computer.',
      );
    return preferred;
  }
  const entries = Object.entries(interfaces).sort(([a], [b]) => {
    const priority = (name) =>
      /^(en\d|eth\d|wlan\d|wlp|enp)/.test(name) ? 0 : 1;
    return priority(a) - priority(b);
  });
  for (const [name, addresses] of entries) {
    if (/^(lo|utun|tun|tap|docker|veth|br-|awdl|llw)/.test(name)) continue;
    const address = addresses?.find(
      (item) =>
        item.family === 'IPv4' && !item.internal && isIPv4(item.address),
    );
    if (address) return address.address;
  }
  return undefined;
}
