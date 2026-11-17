import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

const server = spawn(process.execPath, ['dist/server/main.js'], {
  env: {
    ...process.env,
    ...(process.env.OIDC_CA_FILE ? { NODE_EXTRA_CA_CERTS: process.env.OIDC_CA_FILE } : {}),
  },
  stdio: 'inherit',
});

server.on('error', (error) => {
  console.error('Failed to start development server', error);
  process.exitCode = 1;
});

server.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
