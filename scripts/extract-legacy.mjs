import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'legacy-index.html'), 'utf8');

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
fs.mkdirSync(path.join(root, 'src/styles'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/styles/app.css'), css.trim() + '\n');

const body = html.match(/<body>([\s\S]*?)<script>/)[1];
fs.mkdirSync(path.join(root, 'src/templates'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/templates/app-shell.html'), body.trim() + '\n');

const classic = html.match(/<script>([\s\S]*?)<\/script>\s*<script type="module">/)[1];
const mod = html.match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/)[1];
fs.mkdirSync(path.join(root, 'src/engine'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/engine/_raw2d.js'), classic);
fs.writeFileSync(path.join(root, 'src/engine/_raw3d.js'), mod);

console.log({
  css: css.length,
  body: body.length,
  '2d': classic.length,
  '3d': mod.length,
});
