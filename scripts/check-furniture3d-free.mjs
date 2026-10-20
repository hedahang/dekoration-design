import fs from 'fs';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

// Minimal free-var check without acorn-walk if missing
const src = fs.readFileSync('src/engine/furniture3d.js', 'utf8');
const known = new Set([
  'THREE', 'RoundedBoxGeometry', 'M', 'mat', 'rng', 'glassMat', 'frameMat',
  'setMatApi', 'buildFurniture', 'api',
  'asMat', 'sh', 'mesh', 'rot', 'box', 'rbox', 'cyl', 'lathe', 'rod', 'tube',
  'blob', 'ring', 'rrect', 'shell', 'darker', 'lighter', 'legs',
  'metal', 'chrome', 'hwMat', 'blackMetal', 'mirror', 'ceramic', 'fabric',
  'woodM', 'screenMat', 'glowMat', 'pull', 'knob', 'fronts', 'vasePts', 'vase',
  'tableLamp', 'plate',
]);
// collect declared names crudely
for (const m of src.matchAll(/\b(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) known.add(m[1]);
for (const m of src.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*)/g)) known.add(m[1]);

const reserved = new Set(`Math Object Array Map String Number Boolean Infinity NaNa undefined null true false
console document window performance this arguments
return if else for while do switch case break continue default
new typeof instanceof void delete in of const let var function class
export import from as try catch finally throw async await yield
debugger with super static get set extends
`.trim().split(/\s+/));

const ids = [...src.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(m => m[1]);
const free = [...new Set(ids)].filter(n => {
  if (known.has(n) || reserved.has(n)) return false;
  if (/^THREE/.test(n)) return false;
  // skip property-like short locals that appear only as params - hard
  return true;
}).sort();

// Focus on likely globals used as values (appear after = or as call arg / in expressions)
const suspicious = free.filter(n =>
  src.includes(` ${n},`) || src.includes(`(${n}`) || src.includes(`${n},`) ||
  src.includes(`${n})`) || src.includes(`= ${n}`) || src.includes(`, ${n}`) ||
  src.includes(`${n};`)
);
console.log('candidates:', suspicious.join(', ') || '(none)');
