/**
 * Rebuild plan2d.js cleanly from _raw2d.js
 * - Functions stay at module scope
 * - Side effects (listeners / onclick / observe) go into bindAll()
 * - Bootstrap goes into initPlan2D()
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, 'src/engine/_raw2d.js'), 'utf8');

const colorStart = raw.indexOf('/* ======================= 颜色 / 材质图案');
const furnSvgStart = raw.indexOf('/* ======================= 家具图例');
const renderStart = raw.indexOf('/* ======================= 渲染');
let body = raw.slice(colorStart, furnSvgStart) + raw.slice(renderStart);

// drop local hex2rgb/shade
body = body.replace(/function hex2rgb\(h\)\{[\s\S]*?function shade\(h,k\)\{[\s\S]*?\}\n\n/, '');
body = body.replace(/window\.View3D/g, 'bridge.View3D');
body = body.replace(
  /function setLang\(l\)\{\n  LANG = l;/,
  'function setLang(l){\n  setLANG(l);'
);

// Remove trailing auto-init
body = body.replace(
  /\napplyStaticLang\(\); syncFullscreen\(\);\nbuildDefs\(\); buildLib\(\); renderOpenings\(\); renderDims\(\);\n\$\('#tip'\)\.textContent = TIPS\(\)\['2d'\];\nfitView\(\); renderAll\(\);\n?$/,
  '\n'
);

// Split: everything before pointer listeners = functions + some mid-file listeners mixed
// Convert svg = usage: original used const svg = $('#plan') — we export let svg set in init

// Extract side-effect regions into bindAll by markers
const markers = {
  ptr: "svg.addEventListener('pointerdown'",
  furn: '/* ======================= 家具库 ======================= */',
  libMove: "addEventListener('pointermove', e => {\n  if (!libDrag",
  importExport: '/* ======================= 导入导出 ======================= */',
  viewSwitch: '/* ======================= 2D / 3D 切换 ======================= */',
  chrome: "document.querySelectorAll('.menu-pop .btn')",
  lang: 'function setLang',
};

const iPtr = body.indexOf(markers.ptr);
const iFurn = body.indexOf(markers.furn);
const iLibMove = body.search(/addEventListener\('pointermove', e => \{\r?\n  if \(!libDrag/);
const iImp = body.indexOf(markers.importExport);
const iView = body.indexOf(markers.viewSwitch);
const iChrome = body.indexOf(markers.chrome);
const iLang = body.indexOf(markers.lang);

if ([iPtr, iFurn, iLibMove, iImp, iView, iChrome, iLang].some(i => i < 0)) {
  throw new Error('marker missing: ' + JSON.stringify({ iPtr, iFurn, iLibMove, iImp, iView, iChrome, iLang }));
}

// keyboard is between ptr block end and furn — included in ptr section through keydown
// Structure of body after render:
//   functions... endDrag
//   svg listeners + keyboard          [iPtr .. iFurn)
//   buildLib + dropPoint + libDrag vars
//   lib pointermove/up                [iLibMove .. iImp)
//   download, exportPNG, toast
//   setView / is3D / TIPS             [iView .. iChrome)
//   chrome onclicks + resize + setLang + lang onclick  [iChrome .. end)

const beforePtr = body.slice(0, iPtr);
const ptrAndKey = body.slice(iPtr, iFurn);
const furnSection = body.slice(iFurn, iLibMove); // buildLib, itemOf, libDrag, dropPoint
const libListeners = body.slice(iLibMove, iImp);
const impSection = body.slice(iImp, iView); // download, exportPNG, toast
const viewSection = body.slice(iView, iChrome); // setView etc — may include no side effects until chrome
const chromeAndRest = body.slice(iChrome);

// chromeAndRest contains: chrome bindings, fullscreen fns, resize, setLang, lang onclick
// Extract function defs (toggleFullscreen, syncFullscreen, setLang) vs side effects

// Pull fullscreen functions out of chrome block
let chrome = chromeAndRest;
const fsBlockMatch = chrome.match(/\/\* 全屏[\s\S]*?function syncFullscreen\(\)\{[\s\S]*?\n\}/);
const fsBlock = fsBlockMatch ? fsBlockMatch[0] + '\n' : '';
if (fsBlock) chrome = chrome.replace(fsBlockMatch[0], '/* fullscreen fns hoisted */');

const setLangMatch = chrome.match(/function setLang\(l\)\{[\s\S]*?\n\}/);
const setLangFn = setLangMatch ? setLangMatch[0] + '\n' : '';
if (setLangFn) chrome = chrome.replace(setLangMatch[0], '/* setLang hoisted */');

// lang onclick and auto-init already removed; chrome may still have lang onclick
const langClickMatch = chrome.match(/\$\('#langSel'\)\.onclick[\s\S]*?;\n/);
const langClick = langClickMatch ? langClickMatch[0] : '';
if (langClick) chrome = chrome.replace(langClickMatch[0], '');

// Resize observer block
const resizeMatch = chrome.match(/let lastW = 0, lastH = 0;\nnew ResizeObserver\(\(\) => \{[\s\S]*?\}\)\.observe\(svg\);\n/);
const resizeBlock = resizeMatch ? resizeMatch[0] : '';
if (resizeBlock) chrome = chrome.replace(resizeMatch[0], '');

// Fix state reassignment in chrome (import/reset)
chrome = chrome
  .replace(
    /const b = snap\(\); state = fixState\(s\); ui\.sel = null; commit\(b\); renderAll\(\);/,
    'const b = snap(); replaceState(fixState(s)); ui.sel = null; commit(b); toast(tr(\'方案已导入\', \'Plan imported\'));'
  )
  .replace(
    /toast\(tr\('方案已导入', 'Plan imported'\)\); \n    catch/,
    'catch'
  );
// The above might double toast - check original import handler
chrome = chrome.replace(
  /replaceState\(fixState\(s\)\); ui\.sel = null; commit\(b\); toast\(tr\('方案已导入', 'Plan imported'\)\); toast\(tr\('方案已导入', 'Plan imported'\)\);/,
  "replaceState(fixState(s)); ui.sel = null; commit(b); toast(tr('方案已导入', 'Plan imported'));"
);
chrome = chrome.replace(
  /const b = snap\(\); state = defaultState\(\); ui\.sel = null; commit\(b\); renderAll\(\);/,
  'const b = snap(); replaceState(defaultState()); ui.sel = null; commit(b);'
);

const out = `/**
 * 2D 平面引擎 —— 由 Vue onMounted 调用 initPlan2D()
 */
import {
  WALLS, WINS, DOORS, SLIDES, ROOMS, MATS, LIB,
  uid, F, defaultState, fixState,
  PX_MM, COARSE, TAP, narrow, BOUNDS,
} from '../data/floorplan.js';
import { LANG, LANG_KEY, tr, nm, applyStaticLang, setLANG } from '../i18n.js';
import {
  state, ui, view, undoStack, redoStack,
  save, snap, commit, mutate, undo, redo, getF, validateSel,
  setStoreHooks, replaceState,
} from '../store/design.js';
import { area, perim, bbox, aabb, fmt, norm, snapRects } from '../utils/geometry.js';
import { shade } from '../utils/color.js';
import { furnSVG } from './furnitureSvg.js';
import { bridge } from './bridge.js';

export { state, ui, view, getF, snap, commit, mutate, save, undo, redo };
export const $ = s => document.querySelector(s);
export let svg;

${beforePtr}

${furnSection}

${impSection}

${fsBlock}

${viewSection}

${setLangFn}

function bindAll() {
${ptrAndKey}
${libListeners}
${chrome}
${resizeBlock}
${langClick}
}

export function initPlan2D() {
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
  bridge.select = select;
  bridge.closeDrawers = closeDrawers;
  bridge.api = {
    state, ui, view, getF, snap, commit, mutate, save, snapMove,
    renderAll, select, closeDrawers, aabb, COARSE, TAP, tr, nm,
    ROOMS, WALLS, WINS, DOORS, SLIDES, MATS, $,
  };
  window.select = select;
  window.closeDrawers = closeDrawers;
}

export { select, closeDrawers, setView, renderAll, is3D, snapMove };
`;

fs.writeFileSync(path.join(root, 'src/engine/plan2d.js'), out);
console.log('rebuilt plan2d.js', out.length);
console.log({
  hasBuildLib: out.includes('function buildLib'),
  hasBindAll: out.includes('function bindAll'),
  hasSetView: out.includes('function setView'),
  hasSelect: out.includes('function select'),
  hasSnapMove: out.includes('function snapMove'),
});
