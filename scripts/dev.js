import { spawn } from 'child_process';

console.log('🚀 Starting OpenProofPay API and Web Dashboard concurrently...\n');

const api = spawn('npm', ['run', 'dev', '--workspace=@openproofpay/api'], {
  stdio: 'inherit',
  shell: true
});

const web = spawn('npm', ['run', 'dev', '--workspace=@openproofpay/web'], {
  stdio: 'inherit',
  shell: true
});

const cleanup = (code = 0) => {
  api.kill();
  web.kill();
  process.exit(code);
};

api.on('exit', (code) => {
  if (code !== 0) cleanup(code);
});

web.on('exit', (code) => {
  if (code !== 0) cleanup(code);
});

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));
