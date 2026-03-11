const { spawn } = require('node:child_process');

const rawArgs = process.argv.slice(2);
const lowerArgs = rawArgs.map((arg) => String(arg).toLowerCase());

let configuration = 'development';
if (lowerArgs.includes('prod') || lowerArgs.includes('production')) {
  configuration = 'production';
}
if (lowerArgs.includes('dev') || lowerArgs.includes('development')) {
  configuration = 'development';
}

const passthroughArgs = rawArgs.filter((arg) => arg.startsWith('-'));
const ngArgs = ['ng', 'serve', 'fyp', '--configuration', configuration, ...passthroughArgs];

const command = 'npx';
const child = spawn(command, ngArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
