const { spawn } = require('node:child_process');
const path = require('node:path');
const cli = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const args = process.argv.slice(2);
// Current Wrangler needs Node 22; use a managed runtime on older machines.
const modern = Number(process.versions.node.split('.')[0]) >= 22;
const child = modern
  ? spawn(process.execPath, [cli, ...args], { stdio: 'inherit' })
  : spawn('npm', ['exec', '--yes', '--package=node@22', '--', 'node', cli, ...args], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => process.exit(code ?? 1));
