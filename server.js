// The CRM backend now runs on Cloudflare Workers with the remote D1 binding.
const { spawn } = require('node:child_process');
const child = spawn('npm', ['start'], { stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
