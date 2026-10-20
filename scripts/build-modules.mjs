/**
 * Progressive split: produce working ES modules from legacy raw scripts.
 * Strategy: plan2d keeps most 2D logic; thin store/i18n/data extracts;
 * view3d imports shared API from bridge populated by plan2d.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eng = path.join(root, 'src/engine');
const raw2d = fs.readFileSync(path.join(eng, '_raw2d.js'), 'utf8');
const raw3d = fs.readFileSync(path.join(eng, '_raw3d.js'), 'utf8');

fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
fs.mkdirSync(path.join(root, 'src/store'), { recursive: true });
fs.mkdirSync(path.join(root, 'src/utils'), { recursive: true });
fs.mkdirSync(eng, { recursive: true });

// ---- bridge ----
fs.writeFileSync(path.join(eng, 'bridge.js'), `/** Shared runtime bridge between 2D / 3D engines */
export const bridge = {
  View3D: null,
  /** @type {null | ((sel: any) => void)} */
  select: null,
  closeDrawers: null,
  /** populated by initPlan2D — 3D reads these */
  api: null,
};
`);

// ---- utils/color.js ----
fs.writeFileSync(path.join(root, 'src/utils/color.js'), `export function hex2rgb(h){
  h = h.replace('#','');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(h, k){
  const f = v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) * 2 : v * k)));
  return '#' + hex2rgb(h).map(v => f(v).toString(16).padStart(2, '0')).join('');
}
`);

// ---- Extract sections from raw2d by markers ----
function idx(mark) {
  const i = raw2d.indexOf(mark);
  if (i < 0) throw new Error('mark not found: ' + mark.slice(0, 50));
  return i;
}

const i18nStart = idx('/* ======================= 多语言');
const dataStart = idx('/* ============================================================');
const stateStart = idx('/* ======================= 状态 / 历史 / 存储');
const geoStart = idx('/* ======================= 几何工具');
const colorStart = idx('/* ======================= 颜色 / 材质图案');
const furnSvgStart = idx('/* ======================= 家具图例');
const renderStart = idx('/* ======================= 渲染');

// i18n
let i18n = raw2d.slice(i18nStart, dataStart);
i18n = i18n
  .replace('const LANG_KEY', 'export const LANG_KEY')
  .replace('const LANGS', 'export const LANGS')
  .replace('let LANG =', 'export let LANG =')
  .replace('const S2T_PHRASES', 'export const S2T_PHRASES')
  .replace('const S2T =', 'export const S2T =')
  .replace('const s2t =', 'export const s2t =')
  .replace('const tr =', 'export const tr =')
  .replace('const NAMES_EN', 'export const NAMES_EN')
  .replace('const nm =', 'export const nm =')
  .replace('function applyStaticLang', 'export function applyStaticLang');
i18n += '\nexport function setLANG(l){ LANG = l; }\n';
fs.writeFileSync(path.join(root, 'src/i18n.js'), i18n);

// data/floorplan.js — WALLS … BOUNDS (drop $ / svg)
let data = raw2d.slice(dataStart, stateStart);
data = data.replace(/\r\n/g, '\n');
data = data
  .replace(/\nconst \$ = s => document\.querySelector\(s\);\n/, '\n')
  .replace(/\nconst svg = \$\('#plan'\);\n/, '\n')
  .replace('const WALLS', 'export const WALLS')
  .replace('const WINS', 'export const WINS')
  .replace('const DOORS', 'export const DOORS')
  .replace('const SLIDES', 'export const SLIDES')
  .replace('const R =', 'export const R =')
  .replace('const ROOMS', 'export const ROOMS')
  .replace('const MATS', 'export const MATS')
  .replace('const LIB', 'export const LIB')
  .replace('const typeColor', 'export const typeColor')
  .replace('const uid =', 'export const uid =')
  .replace('const F =', 'export const F =')
  .replace('function defaultFurniture', 'export function defaultFurniture')
  .replace('function defaultState', 'export function defaultState')
  .replace('const STORE', 'export const STORE')
  .replace('function load()', 'export function load()')
  .replace('function fixState', 'export function fixState')
  .replace('const PX_MM', 'export const PX_MM')
  .replace('const COARSE', 'export const COARSE')
  .replace('const TAP', 'export const TAP')
  .replace('const narrow', 'export const narrow')
  .replace('const BOUNDS', 'export const BOUNDS');
fs.writeFileSync(path.join(root, 'src/data/floorplan.js'), data);

// store — from state block only (without geometry)
let stateBlock = raw2d.slice(stateStart, geoStart);
stateBlock = stateBlock
  .replace('/* ======================= 状态 / 历史 / 存储 ======================= */\n', '')
  .replace('let state = load() || defaultState();', 'export let state = load() || defaultState();')
  .replace('const ui =', 'export const ui =')
  .replace('let view =', 'export let view =')
  .replace('const undoStack', 'export const undoStack')
  .replace('function save()', 'export function save()')
  .replace('const snap =', 'export const snap =')
  .replace('function commit', 'export function commit')
  .replace('function mutate', 'export function mutate')
  .replace('function undo()', 'export function undo()')
  .replace('function redo()', 'export function redo()')
  .replace('function validateSel', 'export function validateSel')
  .replace('const getF =', 'export const getF =');

const storeJs = `import { load, defaultState, STORE } from '../data/floorplan.js';
import { tr } from '../i18n.js';

${stateBlock}
`;
fs.writeFileSync(path.join(root, 'src/store/design.js'), storeJs);

// geometry utils
let geo = raw2d.slice(geoStart, colorStart);
geo = `import { WALLS, WINS } from '../data/floorplan.js';
import { state } from '../store/design.js';

` + geo
  .replace('const area =', 'export const area =')
  .replace('const perim =', 'export const perim =')
  .replace('const bbox =', 'export const bbox =')
  .replace('function aabb', 'export function aabb')
  .replace('const fmt =', 'export const fmt =')
  .replace('const norm =', 'export const norm =')
  .replace('function snapRects', 'export function snapRects');
fs.writeFileSync(path.join(root, 'src/utils/geometry.js'), geo);

// furnitureSvg.js
let furnSvg = raw2d.slice(furnSvgStart, renderStart);
furnSvg = `import { shade } from '../utils/color.js';

` + furnSvg.replace('function furnSVG', 'export function furnSVG');
fs.writeFileSync(path.join(eng, 'furnitureSvg.js'), furnSvg);

// ---- plan2d.js: from color/buildDefs + render to end ----
let plan = raw2d.slice(colorStart);
// drop hex2rgb/shade (use utils), drop furnSVG block
plan = plan.replace(/function hex2rgb\(h\)\{[\s\S]*?function shade\(h,k\)\{[\s\S]*?\}\n\n/, '');
plan = plan.replace(raw2d.slice(furnSvgStart, renderStart), '');

plan = plan
  .replace(/window\.View3D/g, 'bridge.View3D')
  .replace(
    /function setLang\(l\)\{\n  LANG = l; try \{ localStorage\.setItem\(LANG_KEY, l\); \} catch\(e\) \{\}/,
    'function setLang(l){\n  setLANG(l); try { localStorage.setItem(LANG_KEY, l); } catch(e) {}'
  );

// Remove trailing auto-init
plan = plan.replace(
  /\napplyStaticLang\(\); syncFullscreen\(\);\nbuildDefs\(\); buildLib\(\); renderOpenings\(\); renderDims\(\);\n\$\('#tip'\)\.textContent = TIPS\(\)\['2d'\];\nfitView\(\); renderAll\(\);\n?$/,
  '\n'
);

const planJs = `/**
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
} from '../store/design.js';
import { area, perim, bbox, aabb, fmt, norm, snapRects } from '../utils/geometry.js';
import { shade } from '../utils/color.js';
import { furnSVG } from './furnitureSvg.js';
import { bridge } from './bridge.js';

export { state, ui, view, getF, snap, commit, mutate, save, undo, redo };
export const $ = s => document.querySelector(s);
export let svg;

${plan}

export function initPlan2D() {
  svg = $('#plan');
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
    state, ui, view, getF, snap, commit, mutate, save,
    renderAll, select, closeDrawers, aabb, COARSE, TAP, tr, nm,
    ROOMS, WALLS, WINS, DOORS, SLIDES, MATS, $,
  };
  window.select = select;
  window.closeDrawers = closeDrawers;
}

export { select, closeDrawers, setView, renderAll, is3D };
`;
fs.writeFileSync(path.join(eng, 'plan2d.js'), planJs);

// ---- furniture3d + view3d ----
const geoToolsMark = '/* ======================= 几何小工具（y = 底面高度） ======================= */';
const archMark = '/* ======================= 建筑 ======================= */';
const iGeo = raw3d.indexOf(geoToolsMark);
const iArch = raw3d.indexOf(archMark);
if (iGeo < 0 || iArch < 0) throw new Error('3d furniture marks missing');

let furn3d = raw3d.slice(iGeo, iArch);
furn3d = `import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const M = v => v / 1000;

let mat, rng;
export function setMatApi(api) {
  mat = api.mat;
  rng = api.rng;
}

${furn3d.replace('function buildFurniture', 'export function buildFurniture')}
`;
fs.writeFileSync(path.join(eng, 'furniture3d.js'), furn3d);

let viewBody = raw3d.slice(0, iGeo) + '/* furniture → furniture3d.js */\n' + raw3d.slice(iArch);
viewBody = viewBody
  .replace(/import \* as THREE from 'three';\s*/, '')
  .replace(/import \{OrbitControls\} from 'three\/addons\/controls\/OrbitControls\.js';\s*/, '')
  .replace(/import \{PointerLockControls\} from 'three\/addons\/controls\/PointerLockControls\.js';\s*/, '')
  .replace(/import \{RoundedBoxGeometry\} from 'three\/addons\/geometries\/RoundedBoxGeometry\.js';\s*/, '')
  .replace(/import \{RoomEnvironment\} from 'three\/addons\/environments\/RoomEnvironment\.js';\s*/, '')
  .replace(/import \{CSS2DRenderer, CSS2DObject\} from 'three\/addons\/renderers\/CSS2DRenderer\.js';\s*/, '')
  .replace(/window\.select/g, 'bridge.select')
  .replace(/window\.closeDrawers/g, '() => bridge.closeDrawers?.()')
  .replace(/window\.View3D = /, 'bridge.View3D = window.View3D = ');

// Inject setMatApi after materials ready in init
viewBody = viewBody.replace(
  /glassMat = new THREE\.MeshPhysicalMaterial/,
  'setMatApi({ mat, rng });\n  glassMat = new THREE.MeshPhysicalMaterial'
);

// Local M stays in view3d (wx/wz/M line). buildFurniture imported uses its own M.

const view3dJs = `/**
 * 3D 场景引擎（three.js）
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { WALLS, WINS, DOORS, SLIDES, ROOMS, MATS, COARSE, TAP } from '../data/floorplan.js';
import { tr, nm } from '../i18n.js';
import { state, ui, view, getF, snap, commit } from '../store/design.js';
import { aabb } from '../utils/geometry.js';
import { bridge } from './bridge.js';
import { buildFurniture, setMatApi } from './furniture3d.js';

const $ = s => document.querySelector(s);

// snapMove lives in plan2d; resolve via bridge when dragging in 3D
function snapMove(f, x, y) {
  return bridge.api?.snapMove ? bridge.api.snapMove(f, x, y) : [x, y];
}
function renderAll() { bridge.api?.renderAll?.(); }

${viewBody}
`;
fs.writeFileSync(path.join(eng, 'view3d.js'), view3dJs);

console.log('OK');
for (const f of [
  'src/i18n.js', 'src/data/floorplan.js', 'src/store/design.js',
  'src/utils/geometry.js', 'src/utils/color.js',
  'src/engine/bridge.js', 'src/engine/furnitureSvg.js', 'src/engine/furniture3d.js',
  'src/engine/plan2d.js', 'src/engine/view3d.js',
]) {
  const p = path.join(root, f);
  console.log(f.padEnd(40), fs.existsSync(p) ? fs.statSync(p).size : 'MISSING');
}
