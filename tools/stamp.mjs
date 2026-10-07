// stamp.mjs - stop browsers running yesterday's code.
//
// A plain file server (python -m http.server, Live Server...) sends no cache
// headers, so browsers keep old copies of the ES modules and a change to one
// file - a new fish list, say - never shows up. This writes an import map
// into index.html that gives every module a ?v=<content hash>: when a file
// changes its URL changes, and the browser has to fetch it.
//
//   node tools/stamp.mjs        (run after changing any .js file)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk(join(root, 'src')); walk(join(root, 'lib'));

const hash = p => createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 8);
const imports = {};
for (const p of files.sort()) { const rel = './' + relative(root, p).split('\\').join('/'); imports[rel] = rel + '?v=' + hash(p); }

const map = `<!-- stamp:start (written by tools/stamp.mjs - do not edit by hand) -->
<script type="importmap">${JSON.stringify({ imports }, null, 1)}</script>
<!-- stamp:end -->`;
const indexPath = join(root, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (html.includes('<!-- stamp:start')) html = html.replace(/<!-- stamp:start[\s\S]*?<!-- stamp:end -->/, map);
else html = html.replace('<link rel="stylesheet"', map + '\n<link rel="stylesheet"');
// the entry script is loaded by its src attribute, which an import map does not touch
html = html.replace(/src="src\/main\.js(\?v=\w+)?"/, `src="${imports['./src/main.js']}"`.replace('"./', '"'));
html = html.replace(/href="styles\/main\.css(\?v=\w+)?"/, `href="styles/main.css?v=${hash(join(root, 'styles', 'main.css'))}"`);
writeFileSync(indexPath, html);
console.log('stamped', files.length, 'modules');
