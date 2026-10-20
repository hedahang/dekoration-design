import fs from 'fs';

const p = 'src/engine/plan2d.js';
let s = fs.readFileSync(p, 'utf8');

// Close bindPlanDom right after keyboard handler, before 家具库
const furnitureMark = '/* ======================= 家具库 ======================= */';
const fi = s.indexOf(furnitureMark);
if (fi < 0) throw new Error('furniture mark missing');

// Is bindPlanDom still open here? Insert closing brace before furniture if needed.
// Find if there's already a close between keydown end and furniture
const keyEnd = s.lastIndexOf('});', fi);
const between = s.slice(keyEnd, fi);
if (!between.includes('function bindPlanDom') && !/^\s*\}\s*$/m.test(between.trim())) {
  // Check: after keydown's }); we need to close bindPlanDom BEFORE furniture,
  // but ResizeObserver should be IN bindPlanDom.
}

// Simpler approach: extract a clean version of the binding sections.
// 1) Remove the stray `function bindPlanDom() {` and its mismatched closes
// 2) Remove `function bindChrome() {` wrapper  
// 3) Put ALL top-level side effects into one `function bindAll() { ... }` at the end
//    called from initPlan2D, while keeping function declarations at module scope.

// Remove bindPlanDom wrapper opening
s = s.replace('\n\nfunction bindPlanDom() {\n', '\n');
// Remove bindChrome wrapper opening  
s = s.replace('\nfunction bindChrome() {\n', '\n');

// Remove the stray closing braces before setLang that belonged to wrappers.
// Pattern near end: reset onclick }; \n}\n// 横竖屏 ... ResizeObserver ... }).observe(svg);\n}\n\n\nfunction setLang
const messy = s.match(
  /\$\('#reset'\)\.onclick[\s\S]*?function setLang/
);
if (!messy) throw new Error('messy tail not found');

const cleanTail = `$('#reset').onclick = () => { if (confirm(tr('恢复为默认设计方案？（可撤销）', 'Reset to the default design? (undoable)'))){ const b = snap(); replaceState(defaultState()); ui.sel = null; commit(b); } };

let lastW = 0, lastH = 0;

function setLang`;

s = s.replace(messy[0], cleanTail);

// Now wrap side-effect-only statements into bindAll().
// Strategy: initPlan2D calls a new bindAll that contains the event wiring.
// Find from first svg.addEventListener to end of reset onclick — move into bindAll.

const start = s.indexOf("svg.addEventListener('pointerdown'");
const resetLine = s.indexOf("$('#reset').onclick");
const resetEnd = s.indexOf('\n', s.indexOf('};', resetLine)) + 1;
if (start < 0 || resetLine < 0) throw new Error('bind range missing');

const bindBody = s.slice(start, resetEnd);
// Also need ResizeObserver after lastW declaration
const lastWDecl = 'let lastW = 0, lastH = 0;\n';
const lastWi = s.indexOf(lastWDecl);
if (lastWi < 0) throw new Error('lastW missing');

// Remove bind body from current location (leave functions like buildLib in place)
// But bind body includes buildLib function definition! Can't just cut start→reset.

// Different strategy: only defer the addEventListener / onclick / observe calls
// by guarding with `if (!globalThis.__plan2dBound)` at the start of init... 

// NUCLEAR SIMPLE: at top of module after imports, don't run side effects.
// Change every top-level `svg.addEventListener` to be inside bindAll,
// but buildLib must stay at module level.

// Re-read file state and do surgical cut:
// - Keep everything as module-level functions
// - Collect ONLY lines that are side effects into bindAll

console.log('Current approach: guard init with deferred binding via Function rewrite');

// Re-read fresh approach - write bindAll containing:
// 1. All svg.* listeners + keydown + gesture + lib pointer + chrome onclicks + resize
// Functions buildLib, setView, toast, etc. stay outside

// Find and remove the svg.addEventListener block through keyboard }); 
// Insert as part of bindAll later.

const ptdown = s.indexOf("svg.addEventListener('pointerdown'");
const afterKey = s.indexOf(furnitureMark);
const svgBindBlock = s.slice(ptdown, afterKey);
s = s.slice(0, ptdown) + '/* svg/keyboard bindings → bindAll */\n\n' + s.slice(afterKey);

// Remove lib addEventListener side effects (keep functions)
s = s.replace(
  /\naddEventListener\('pointermove', e => \{[\s\S]*?if \(narrow\(\) && lib\.classList\.contains\('open'\) && e\.clientX > lib\.getBoundingClientRect\(\)\.right\) drawer\(null\);   \/\/ 拖出抽屉后自动收起\n\}\);/,
  '\n/* lib pointermove → bindAll */'
);
s = s.replace(
  /\naddEventListener\('pointerup', e => endLibDrag\(e, true\)\);\naddEventListener\('pointercancel', e => endLibDrag\(e, false\)\);/,
  '\n/* lib pointerup → bindAll */'
);

// Remove chrome side effects from first document.querySelectorAll('.menu-pop through reset
const chromeStart = s.indexOf("document.querySelectorAll('.menu-pop .btn')");
const chromeReset = s.indexOf("$('#reset').onclick", chromeStart);
const chromeEnd = s.indexOf('\n', s.indexOf('};', chromeReset)) + 1;
const chromeBlock = s.slice(chromeStart, chromeEnd);
// Keep toggleFullscreen/syncFullscreen function defs — they're inside chromeBlock currently
// Extract function defs out
const fsFn = chromeBlock.match(/\/\* 全屏[\s\S]*?function syncFullscreen\(\)\{[\s\S]*?\}\n/)?.[0] || '';
s = s.slice(0, chromeStart) + fsFn + '/* chrome bindings → bindAll */\n' + s.slice(chromeEnd);

// Remove leftover fullscreen/tgLib etc if any remain as side effects after fsFn extraction
// Build bindAll before initPlan2D
const libMove = `
  addEventListener('pointermove', e => {
    if (!libDrag || e.pointerId !== libDrag.id) return;
    const {it} = libDrag;
    if (!libDrag.ghost){
      if (Math.hypot(e.clientX-libDrag.sx, e.clientY-libDrag.sy) < TAP) return;
      const g = libDrag.ghost = document.createElement('div'); g.id = 'ghost';
      g.innerHTML = \`<svg viewBox="\${-it[2]/2} \${-it[3]/2} \${it[2]} \${it[3]}">\${furnSVG(it[0],it[2],it[3],it[4])}</svg>\`;
      document.body.appendChild(g); libDrag.el.classList.add('dragging');
    }
    const g = libDrag.ghost, sc = Math.max(dropPoint(e.clientX, e.clientY)?.s || (is3D() ? .05 : view.s), .02);
    Object.assign(g.style, {width:Math.max(28, it[2]*sc)+'px', height:Math.max(20, it[3]*sc)+'px', left:e.clientX+'px', top:e.clientY+'px'});
    const lib = $('aside.lib');
    if (narrow() && lib.classList.contains('open') && e.clientX > lib.getBoundingClientRect().right) drawer(null);
  });
  addEventListener('pointerup', e => endLibDrag(e, true));
  addEventListener('pointercancel', e => endLibDrag(e, false));
`;

const bindAll = `
function bindAll() {
${svgBindBlock}
${libMove}
${chromeBlock.replace(fsFn, '')}
  let _lw = 0, _lh = 0;
  new ResizeObserver(() => {
    const w = svg.clientWidth, h = svg.clientHeight; if (!w) return;
    if (!_lw) fitView();
    else { view.x0 -= (w - _lw)/2/view.s; view.y0 -= (h - _lh)/2/view.s; applyView(); }
    _lw = w; _lh = h;
  }).observe(svg);
}
`;

s = s.replace(
  'export function initPlan2D()',
  bindAll + '\nexport function initPlan2D()'
);

s = s.replace(
  `export function initPlan2D() {
  svg = $('#plan');
  bindPlanDom();
  bindChrome();
  setStoreHooks({ renderAll, toast });
  applyStaticLang();
  syncFullscreen();
  buildDefs();
  buildLib();
  renderOpenings();
  renderDims();
  $('#tip').textContent = TIPS()['2d'];
  fitView();
  renderAll();
  $('#langSel').onclick = e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l && l !== LANG) setLang(l); };
  // remaining chrome hooks that stayed at module level in legacy
  $('#tgLib').onclick = () => drawer('lib');
  $('#tgPanel').onclick = () => drawer('panel');
  $('#fullscreen').onclick = toggleFullscreen;
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, syncFullscreen));
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) $('#fullscreen').hidden = true;
  document.addEventListener('pointerdown', e => { const m = $('details.menu'); if (m?.open && !m.contains(e.target)) m.open = false; });
  matchMedia('(max-width:1100px).addEventListener('change', () => drawer(null));
  drawer(null);
  $('#exportPng').onclick = exportPNG;
  $('#exportJson').onclick = () => download(tr('户型装修方案', 'floor-plan-design') + '.json', new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  $('#importJson').onclick = () => $('#fileIn').click();
  bridge.select = select;`,
  `export function initPlan2D() {
  svg = $('#plan');
  bindAll();
  setStoreHooks({ renderAll, toast });
  applyStaticLang();
  syncFullscreen();
  buildDefs();
  buildLib();
  renderOpenings();
  renderDims();
  $('#tip').textContent = TIPS()['2d'];
  fitView();
  renderAll();
  $('#langSel').onclick = e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l && l !== LANG) setLang(l); };
  bridge.select = select;`
);

// Remove leftover lastW ResizeObserver if still present
s = s.replace(/\nlet lastW = 0, lastH = 0;\n/, '\n');
s = s.replace(/\n\/\* chrome bindings → bindAll \*\/\n[\s\S]*?(?=function setLang)/, '\n/* chrome bindings → bindAll */\n\n');

fs.writeFileSync(p, s);
console.log('structure fixed', s.length);
// sanity
console.log('has bindAll', s.includes('function bindAll()'));
console.log('has buildLib at module', /(?:^|\n)function buildLib\(/.test(s));
console.log('has initPlan2D bindAll call', s.includes('bindAll();'));
console.log('stray bindPlanDom', s.includes('bindPlanDom'));
