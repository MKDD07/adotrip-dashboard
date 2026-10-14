const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
for (const file of ['index.html','styles.css','app.js','login.html','login.js']) fs.copyFileSync(file, `dist/${file}`);
console.log('Built public assets in dist/');
