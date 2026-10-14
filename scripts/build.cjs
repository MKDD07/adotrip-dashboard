const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const files = ['index.html', 'styles.css', 'app.js', 'login.html', 'login.js'];
function build(root = path.join(__dirname, '..')) {
  const output = path.join(root, 'dist');
  fs.mkdirSync(output, { recursive: true });
  const versions = Object.fromEntries(['styles.css', 'app.js', 'login.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 16)]));
  for (const file of files) {
    let content = fs.readFileSync(path.join(root, file));
    if (file.endsWith('.html')) {
      content = content.toString().replace(/\b(href|src)="(\/?)(styles\.css|app\.js|login\.js)(?:\?[^"\s]*)?"/g, (_, attribute, prefix, asset) => `${attribute}="${prefix}${asset}?v=${versions[asset]}"`);
    }
    const target = path.join(output, file);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(Buffer.from(content))) fs.writeFileSync(target, content);
  }
  console.log('Built public assets in dist/');
}
function watch(root = path.join(__dirname, '..')) {
  let timer;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { try { build(root); } catch (error) { console.error('Asset rebuild failed:', error.message); } }, 100);
  };
  const sources = files.map(file => path.join(root, file));
  for (const source of sources) fs.watchFile(source, { interval: 250 }, changed);
  return { close() { clearTimeout(timer); for (const source of sources) fs.unwatchFile(source, changed); } };
}
module.exports = { build, watch };
if (require.main === module) build();
