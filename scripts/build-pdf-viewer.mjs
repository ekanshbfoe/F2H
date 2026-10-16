// Builds assets/pdfjs/viewer.html: the offline PDF reader the file sheet loads in a WebView.
//
// Usage: node scripts/build-pdf-viewer.mjs <path to an unpacked pdfjs-dist@3.11.174 package>
//   (get one with `npm pack pdfjs-dist@3.11.174` and untar it; pdf.js is not an app dependency)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = process.argv[2];
if (!pkg) {
  console.error('usage: node scripts/build-pdf-viewer.mjs <unpacked pdfjs-dist dir>');
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
if (version !== '3.11.174') {
  console.error(`expected pdfjs-dist 3.11.174, found ${version}`);
  process.exit(1);
}

// a "</script" inside the inlined code would end the tag early
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
const lib = safe(readFileSync(join(pkg, 'legacy/build/pdf.min.js'), 'utf8'));
const worker = safe(readFileSync(join(pkg, 'legacy/build/pdf.worker.min.js'), 'utf8'));
const template = readFileSync(join(root, 'scripts/pdf-viewer.template.html'), 'utf8');

const html = template.replace('/*PDFJS*/', () => lib).replace('/*PDFJS_WORKER*/', () => worker);

const out = join(root, 'assets/pdfjs/viewer.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
