import fs from 'fs';

const p = 'src/engine/plan2d.js';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  'setStoreHooks,',
  'setStoreHooks, replaceState,'
);

s = s.replace(
  /const b = snap\(\); state = fixState\(s\); ui\.sel = null; commit\(b\); renderAll\(\);/,
  'const b = snap(); replaceState(fixState(s)); ui.sel = null; commit(b);'
);
s = s.replace(
  /const b = snap\(\); state = defaultState\(\); ui\.sel = null; commit\(b\); renderAll\(\);/,
  'const b = snap(); replaceState(defaultState()); ui.sel = null; commit(b);'
);

// Move svg pointer bindings + resize into bindPlanDom
const startMark = "svg.addEventListener('pointerdown'";
const endMark = '}).observe(svg);';
const a = s.indexOf(startMark);
const b = s.indexOf(endMark, a);
if (a < 0 || b < 0) throw new Error(`svg bind marks ${a} ${b}`);
const end = b + endMark.length;
const block = s.slice(a, end);
s = s.slice(0, a) + '\nfunction bindPlanDom() {\n' + block + '\n}\n' + s.slice(end);

// Move chrome UI bindings (from document.querySelectorAll menu-pop through reset onclick)
const chromeStart = "document.querySelectorAll('.menu-pop .btn')";
const chromeEnd = "$('#reset').onclick";
const c0 = s.indexOf(chromeStart);
const c1 = s.indexOf(chromeEnd, c0);
if (c0 < 0 || c1 < 0) throw new Error(`chrome marks ${c0} ${c1}`);
// include full reset line
const cEnd = s.indexOf('\n', s.indexOf(';', c1)) + 1;
const chrome = s.slice(c0, cEnd);
s = s.slice(0, c0) + '\nfunction bindChrome() {\n' + chrome + '\n}\n' + s.slice(cEnd);

// Also wrap lib drag global listeners that are before import/export section
// addEventListener('pointermove' for lib — leave them; they don't need svg element at bind time

s = s.replace(
  'export function initPlan2D() {\n  svg = $(\'#plan\');\n  setStoreHooks',
  'export function initPlan2D() {\n  svg = $(\'#plan\');\n  bindPlanDom();\n  bindChrome();\n  setStoreHooks'
);

fs.writeFileSync(p, s);
console.log('fixed plan2d.js', s.length);
