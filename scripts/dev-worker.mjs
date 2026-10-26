import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { selectLanAddress } from './network.mjs';

const host = selectLanAddress(networkInterfaces(), process.env.LAN_IP);
const port = process.env.PORT ?? '8787';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('PORT must be 1–65535.');
console.log(`\nPocket Presenter local: http://localhost:${port}`);
if (host)
  console.log(
    `Pocket Presenter LAN:   http://${host}:${port}\nPhone pairing links will use your LAN address.\n`,
  );
else
  console.log(
    'No LAN IPv4 address detected. Connect to Wi-Fi, or set LAN_IP to your computer’s address.\n',
  );

const child = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--ip',
    '0.0.0.0',
    '--port',
    port,
    '--var',
    `LOCAL_LAN_HOST:${host ?? ''}`,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
