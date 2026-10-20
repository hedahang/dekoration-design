/**
 * 2D 平面引擎 —— 由 Vue onMounted 调用 initPlan2D()
 */
import {
  WALLS, WALL_IDS, WINS, DOORS, SLIDES, ROOMS, MATS,
  uid, F, defaultState, fixState, load,
  PX_MM, COARSE, TAP, narrow, BOUNDS,
  wallKey, wallById, ENTRY_MARK, DIM_CHAINS, PLAN_META,
  listPlans, switchPlanId, getActivePlanId, hasPlan,
  isEditablePlan, snapshotGeometry, rebuildEditableGeometry,
} from '../data/floorplan.js';
import { LANG, LANG_KEY, tr, nm, applyStaticLang, setLANG } from '../i18n.js';
import {
  state, ui, view, undoStack, redoStack,
  save, snap, commit, mutate, undo, redo, getF, validateSel,
  setStoreHooks, setSelectHook, replaceState, bootstrapState,
  select, toast, bumpRevision,
} from '../store/design.js';
import {
  area, perim, bbox, aabb, fmt, norm, snapRects,
  segmentToWallRect, wallLengthMm, WALL_THICK,
} from '../utils/geometry.js';
import { outerFrameWalls, FRAME_MIN, FRAME_THICK } from '../utils/roomsFromWalls.js';
import { shade } from '../utils/color.js';
import { furnSVG } from './furnitureSvg.js';
import { bridge } from './bridge.js';

export { state, ui, view, getF, snap, commit, mutate, save, undo, redo };
export const $ = s => document.querySelector(s);
export let svg;

/* ======================= 颜色 / 材质图案 ======================= */
function buildDefs(){
  const plank = (id,base,line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="1800" height="360">
      <rect width="1800" height="360" fill="${base}"/>
      <path d="M0 0H1800M0 180H1800M1200 0V180M600 180V360" stroke="${line}" stroke-width="10"/>
      <path d="M100 70Q500 60 900 85T1700 75M200 260Q700 250 1100 275T1750 262" stroke="${line}" stroke-width="5" fill="none" opacity=".45"/></pattern>`;
  const tile = (id,size,base,line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${base}"/><path d="M0 0H${size}M0 0V${size}" stroke="${line}" stroke-width="10"/></pattern>`;
  $('#defs').innerHTML =
    plank('wood','#dcc09a','#bf9d70') + plank('walnut','#a57c56','#80593a') +
    tile('tile800',800,'#ece7de','#d3cabb') + tile('tile600',600,'#e2e6e3','#c4cbc6') + tile('antislip',300,'#d6dbd7','#b3bab4') +
    `<pattern id="m-marble" patternUnits="userSpaceOnUse" width="1200" height="1200">
      <rect width="1200" height="1200" fill="#f3f0ea"/><path d="M0 0H1200M0 0V1200" stroke="#dcd5c8" stroke-width="10"/>
      <path d="M-50 300C250 260 380 520 700 470S1100 640 1260 600M200 1200C300 950 520 980 640 820" stroke="#d6cfc2" stroke-width="12" fill="none"/></pattern>
    <pattern id="m-terrazzo" patternUnits="userSpaceOnUse" width="500" height="500">
      <rect width="500" height="500" fill="#e8e1d5"/>
      <circle cx="60" cy="80" r="22" fill="#b9a58c"/><circle cx="310" cy="140" r="16" fill="#8fa3a0"/><circle cx="190" cy="330" r="26" fill="#c9b7a2"/>
      <circle cx="420" cy="400" r="18" fill="#a88f76"/><circle cx="90" cy="440" r="12" fill="#8fa3a0"/><circle cx="440" cy="40" r="10" fill="#b9a58c"/></pattern>
    <pattern id="m-carpet" patternUnits="userSpaceOnUse" width="120" height="120">
      <rect width="120" height="120" fill="#c9c3d3"/><circle cx="30" cy="30" r="8" fill="#bab3c6"/><circle cx="90" cy="90" r="8" fill="#bab3c6"/></pattern>
    <pattern id="grid" patternUnits="userSpaceOnUse" width="1000" height="1000">
      <path d="M500 0V1000M0 500H1000" stroke="#e5dfd3" stroke-width="8"/><path d="M0 0V1000M0 0H1000" stroke="#d8d0c1" stroke-width="14"/></pattern>`;
}

/* ======================= 渲染 ======================= */
const NOLABEL = ['plant','floorlamp','sidetable','barstool','beanbag'];
function renderRooms(){
  let s = '';
  ROOMS.forEach(r => {
    const mat = state.rooms[r.id]?.mat || r.mat || 'tile800';
    s += `<polygon class="room" data-room="${r.id}" points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="url(#m-${mat})"/>`;
  });
  const sill = ([a,b,c,d]) => `<rect x="${a}" y="${b}" width="${c-a}" height="${d-b}" fill="#e2dacb" stroke="#b9b0a0" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  DOORS.forEach(d => s += sill(d.rect)); SLIDES.forEach(d => s += sill(d.rect));
  if (!ROOMS.length && isEditablePlan()) {
    s += `<text x="${BOUNDS.x + BOUNDS.w / 2}" y="${BOUNDS.y + BOUNDS.h / 2}" font-size="280" text-anchor="middle" fill="#b0a698">${tr('用「外框」拖出矩形开始自建', 'Use Frame tool to start')}</text>`;
  }
  $('#gRooms').innerHTML = s;
}

function renderFurn(){
  const g = $('#gFurn');
  g.setAttribute('display', ui.layers.furn ? 'inline' : 'none');
  g.innerHTML = state.furniture.map(f => {
    const fs = Math.max(80, Math.min(170, Math.min(f.w,f.d)*.2));
    const label = Math.min(f.w,f.d) >= 380 && !NOLABEL.includes(f.type)
      ? `<text transform="rotate(${-f.rot})" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="#4a443c" opacity=".8" pointer-events="none">${esc(nm(f.name))}</text>` : '';
    return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">${furnSVG(f.type,f.w,f.d,f.color)}${label}</g>`;
  }).join('');
}

function wallFill(k, dem){
  if (dem) return { fill: 'rgba(198,91,58,.12)', ex: 'stroke="#c65b3a" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"' };
  if (k === 'b') return { fill: ui.layers.bearing ? '#b8412c' : '#26241f', ex: '' };
  if (k === 'low') return { fill: '#e9e3d8', ex: 'stroke="#8f897d" stroke-width="1" vector-effect="non-scaling-stroke"' };
  if (k === 'e') return { fill: '#8f897d', ex: '' };
  if (k === 'extra') return { fill: '#7d8f7a', ex: 'stroke="#5f6f5c" stroke-width="1" vector-effect="non-scaling-stroke"' };
  return { fill: '#a7a195', ex: '' };
}

function renderWalls(){
  const editable = isEditablePlan();
  const plan = WALLS.map((w, i) => {
    const [x0, y0, x1, y1, k] = w, id = wallKey(i), dem = state.demolished.includes(id);
    const kind = editable && k === 'n' ? 'extra' : k;
    const { fill, ex } = wallFill(kind, dem);
    const cls = editable && k === 'n' ? 'wall extra' : 'wall';
    return `<rect class="${cls}" data-wall="${id}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${fill}" ${ex}/>`;
  });
  const custom = editable ? [] : (state.extraWalls || []).map(w => {
    const { fill, ex } = wallFill('extra', false);
    return `<rect class="wall extra" data-wall="${w.id}" data-extra="1" x="${w.x0}" y="${w.y0}" width="${w.x1 - w.x0}" height="${w.y1 - w.y0}" fill="${fill}" ${ex}/>`;
  });
  let preview = '';
  if (ui.tool === 'wall' && ui.mA && ui.mCur) {
    const r = segmentToWallRect(ui.mA, ui.mCur, WALL_THICK);
    if (r) {
      preview = `<rect class="wall-preview" x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}"
        fill="rgba(47,93,98,.35)" stroke="#2f5d62" stroke-width="1.5" stroke-dasharray="8 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    }
  }
  if (ui.tool === 'frame' && ui.mA && ui.mCur) {
    const L = Math.min(ui.mA.x, ui.mCur.x), R = Math.max(ui.mA.x, ui.mCur.x);
    const T = Math.min(ui.mA.y, ui.mCur.y), B = Math.max(ui.mA.y, ui.mCur.y);
    const ok = (R - L) >= FRAME_MIN && (B - T) >= FRAME_MIN;
    preview = `<rect class="wall-preview" x="${L}" y="${T}" width="${R - L}" height="${B - T}"
      fill="none" stroke="${ok ? '#2f5d62' : '#b3372a'}" stroke-width="2" stroke-dasharray="10 5" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }
  $('#gWalls').innerHTML = plan.join('') + custom.join('') + preview;
}

function renderOpenings(){
  const WS = 'stroke="#4f7394" stroke-width="1" vector-effect="non-scaling-stroke"';
  let s = '';
  WINS.forEach(([x0,y0,x1,y1]) => {
    const w = x1-x0, h = y1-y0;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f7fbfd" ${WS}/>`;
    if (w >= h) [1/3,2/3].forEach(t => s += `<line x1="${x0}" y1="${y0+h*t}" x2="${x1}" y2="${y0+h*t}" ${WS}/>`);
    else [1/3,2/3].forEach(t => s += `<line x1="${x0+w*t}" y1="${y0}" x2="${x0+w*t}" y2="${y1}" ${WS}/>`);
  });
  const DS = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
  DOORS.forEach(d => {
    const [hx,hy] = d.h, L = d.len, T = 40;
    const ox = hx + d.o[0]*L, oy = hy + d.o[1]*L, cx = hx + d.c[0]*L, cy = hy + d.c[1]*L;
    const sweep = d.o[0]*d.c[1] - d.o[1]*d.c[0] > 0 ? 1 : 0;
    const col = d.entry ? '#b5653a' : '#3d3a34';
    s += `<polygon points="${hx},${hy} ${ox},${oy} ${ox+d.c[0]*T},${oy+d.c[1]*T} ${hx+d.c[0]*T},${hy+d.c[1]*T}" fill="#fff" stroke="${col}" stroke-width="${d.entry?1.8:1}" vector-effect="non-scaling-stroke"/>`;
    s += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/>`;
  });
  SLIDES.forEach(({rect:[x0,y0,x1,y1],v}) => {
    if (v){ const L = y1-y0, m = (x0+x1)/2; s += `<rect x="${m-45}" y="${y0}" width="40" height="${L*.55}" fill="#fff" ${DS}/><rect x="${m+5}" y="${y1-L*.55}" width="40" height="${L*.55}" fill="#fff" ${DS}/>`; }
    else { const L = x1-x0, m = (y0+y1)/2; s += `<rect x="${x0}" y="${m-45}" width="${L*.55}" height="40" fill="#fff" ${DS}/><rect x="${x1-L*.55}" y="${m+5}" width="${L*.55}" height="40" fill="#fff" ${DS}/>`; }
  });
  if (ENTRY_MARK){
    s += `<path d="${ENTRY_MARK.path}" fill="none" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <text x="${ENTRY_MARK.text[0]}" y="${ENTRY_MARK.text[1]}" font-size="200" fill="#b5653a">${tr('入户','Entry')}</text>`;
  }
  $('#gOpen').innerHTML = s;
}

function renderLabels(){
  const g = $('#gLabels');
  g.setAttribute('display', ui.layers.labels ? 'inline' : 'none');
  g.innerHTML = ROOMS.filter(r => r.at).map(r => {
    const [x,y] = r.at, halo = 'stroke="#fbf9f4" stroke-width="45" paint-order="stroke" stroke-linejoin="round"';
    return `<text x="${x}" y="${y}" font-size="250" font-weight="600" text-anchor="middle" fill="#2b2824" ${halo}>${esc(nm(state.rooms[r.id]?.name || r.name))}</text>
      <text x="${x}" y="${y+260}" font-size="175" text-anchor="middle" fill="#7d7366" ${halo}>${fmt(area(r.poly))} m²</text>`;
  }).join('');
}

function renderDims(){
  const DC = '#7d7160', LS = `stroke="${DC}" stroke-width="1" vector-effect="non-scaling-stroke"`, TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
  const txt = (x,y,v,rot) => `<text x="${x}" y="${y}" font-size="${v<400?140:200}" text-anchor="middle" fill="${DC}" ${rot?`transform="rotate(-90 ${x} ${y})"`:''}>${v}</text>`;
  const chain = (horiz, at, start, segs) => {
    const pts = [start]; segs.forEach(v => pts.push(pts[pts.length-1]+v));
    let s = horiz ? `<line x1="${pts[0]}" y1="${at}" x2="${pts.at(-1)}" y2="${at}" ${LS}/>` : `<line x1="${at}" y1="${pts[0]}" x2="${at}" y2="${pts.at(-1)}" ${LS}/>`;
    pts.forEach(p => s += horiz
      ? `<line x1="${p}" y1="${at-170}" x2="${p}" y2="${at+170}" ${LS}/><line x1="${p-80}" y1="${at+80}" x2="${p+80}" y2="${at-80}" ${TK}/>`
      : `<line x1="${at-170}" y1="${p}" x2="${at+170}" y2="${p}" ${LS}/><line x1="${at-80}" y1="${p+80}" x2="${at+80}" y2="${p-80}" ${TK}/>`);
    segs.forEach((v,i) => { const mid = (pts[i]+pts[i+1])/2; s += horiz ? txt(mid, at-70, v) : txt(at-70, mid, v, true); });
    return s;
  };
  const g = $('#gDims');
  g.innerHTML = (DIM_CHAINS || []).map(c => chain(c.horiz, c.at, c.start, c.segs)).join('');
  g.setAttribute('display', ui.layers.dims ? 'inline' : 'none');
}

function renderGrid(){
  $('#gGrid').innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid ? 'url(#grid)' : 'transparent'}" data-bg="1"/>`;
}

function renderMeasure(){
  const k = 1/view.s, fs = 12*k;
  const one = (a,b,tmp) => {
    const L = Math.hypot(b.x-a.x, b.y-a.y); if (L < 1) return '';
    let ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI; if (ang > 90 || ang < -90) ang += 180;
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2, nx = -(b.y-a.y)/L*5*k, ny = (b.x-a.x)/L*5*k;
    const col = tmp ? '#2f5d62' : '#b5653a', S = `stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"`;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${S}/>
      <line x1="${a.x-nx}" y1="${a.y-ny}" x2="${a.x+nx}" y2="${a.y+ny}" ${S}/><line x1="${b.x-nx}" y1="${b.y-ny}" x2="${b.x+nx}" y2="${b.y+ny}" ${S}/>
      <text x="${mx}" y="${my-5*k}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="600" transform="rotate(${ang} ${mx} ${my})"
        stroke="#fff" stroke-width="${3.5*k}" paint-order="stroke">${Math.round(L)} mm</text>`;
  };
  let s = state.measures.map(m => one(m.a,m.b)).join('');
  if (ui.mA && ui.mCur) s += one(ui.mA, ui.mCur, true);
  if (ui.mA) s += `<circle cx="${ui.mA.x}" cy="${ui.mA.y}" r="${3*k}" fill="#2f5d62"/>`;
  $('#gMeasure').innerHTML = s;
}

function renderSel(){
  const k = 1/view.s; let s = '';
  if (ui.sel?.kind === 'furn'){
    const f = getF(ui.sel.id);
    if (f){
      // 触屏上手柄更大、离家具更远，并各带一圈透明的大热区
      const p = 5*k, A = 'stroke="#b5653a" vector-effect="non-scaling-stroke"', hs = COARSE ? 1.7 : 1, ro = (COARSE ? 40 : 26)*k, hit = (COARSE ? 24 : 11)*k;
      const sx = f.w/2+p, sy = f.d/2+p;
      s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">
        <rect x="${-f.w/2-p}" y="${-f.d/2-p}" width="${f.w+2*p}" height="${f.d+2*p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>
        <line x1="0" y1="${-f.d/2-p}" x2="0" y2="${-f.d/2-ro}" ${A} stroke-width="1" pointer-events="none"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${hit}" fill="transparent"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${6*hs*k}" fill="#fff" ${A} stroke-width="1.5"><title>${tr('拖动旋转（Shift 自由角度）','Drag to rotate (Shift for free angle)')}</title></circle>
        <circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>
        <rect data-handle="size" x="${sx-5*hs*k}" y="${sy-5*hs*k}" width="${10*hs*k}" height="${10*hs*k}" fill="#b5653a"><title>${tr('拖动调整尺寸','Drag to resize')}</title></rect></g>`;
      const {hh} = aabb(f);
      s += `<text x="${f.cx}" y="${f.cy+hh+24*k}" font-size="${12*k}" text-anchor="middle" fill="#b5653a" font-weight="600" pointer-events="none"
        stroke="#fff" stroke-width="${3*k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
    }
  } else if (ui.sel?.kind === 'room'){
    const r = ROOMS.find(r => r.id === ui.sel.id);
    s += `<polygon points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="rgba(181,101,58,.08)" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }
  $('#gSel').innerHTML = s;
}

function renderAll(){
  renderGrid(); renderRooms(); renderFurn(); renderWalls(); renderLabels(); renderMeasure(); renderSel(); updateHeader();
  bumpRevision();
  bridge.View3D?.sync();
}

function syncBrand(){
  const title = $('#planTitle');
  if (title) title.textContent = LANG === 'en' ? PLAN_META.nameEn : PLAN_META.name;
  const btn = $('#planMenuBtn');
  if (btn) btn.textContent = (LANG === 'en' ? 'Plan ▾' : '户型 ▾');
  document.querySelectorAll('#planList [data-plan]').forEach(b => {
    b.classList.toggle('on', b.dataset.plan === getActivePlanId());
  });
  syncEditableUi();
}

function updateHeader(){
  const tot = ROOMS.filter(r => r.counted !== false).reduce((a,r) => a + area(r.poly), 0);
  const sub = LANG === 'en' ? PLAN_META.subtitleEn : PLAN_META.subtitle;
  $('#subtitle').textContent = tr(`套内约 ${fmt(tot)} m² · ${sub}`, `Net ≈ ${fmt(tot)} m² · ${sub}`);
  $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
  $('#undo').style.opacity = undoStack.length ? 1 : .4; $('#redo').style.opacity = redoStack.length ? 1 : .4;
  syncBrand();
}

function afterPlanChange(){
  syncEditableUi();
  renderOpenings();
  renderDims();
  fitView();
  renderAll();
  bridge.View3D?.onPlanChange?.();
  const tip = isEditablePlan() && !WALLS.length
    ? tr('已进入空白户型 · 用「外框」拖出矩形开始', 'Blank plan · use Frame to draw the outer shell')
    : tr(`已切换到「${PLAN_META.name}」`, `Switched to "${PLAN_META.nameEn}"`);
  toast(tip);
}

function changePlan(planId){
  if (planId === getActivePlanId()) return;
  if (!confirm(tr(
    '切换户型将保存当前方案，并打开目标户型的布置（各户型独立保存）。继续？',
    'Switching plans saves the current layout and opens the other plan (each plan is stored separately). Continue?'
  ))) return;
  save();
  if (!switchPlanId(planId)) return;
  bootstrapState(load() || defaultState());
  afterPlanChange();
}

function buildPlanMenu(){
  const list = $('#planList');
  if (!list) return;
  list.innerHTML = listPlans().map(p =>
    `<button class="btn ${p.id === getActivePlanId() ? 'on' : ''}" data-plan="${p.id}">${LANG === 'en' ? p.nameEn : p.name}</button>`
  ).join('');
  list.onclick = e => {
    const id = e.target.closest('[data-plan]')?.dataset.plan;
    if (!id) return;
    const menu = $('#planMenu'); if (menu) menu.open = false;
    changePlan(id);
  };
}

/* ======================= 右侧面板 / FAB / Toast 已迁至 Vue ======================= */
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function clearLayout(){
  const n = state.furniture.length;
  if (!n) return toast(tr('当前没有布置任何家具', 'There is no furniture to clear'));
  if (!confirm(tr(`确定清空全部 ${n} 件家具 / 家电吗？\n墙体、地面材料和测量线会保留，可点「撤销」恢复。`, `Remove all ${n} furniture / appliance items?\nWalls, flooring and measurements are kept. You can Undo this.`))) return;
  select(null);
  mutate(() => { state.furniture = []; });
  toast(tr('已清空布置，可点「撤销」恢复', 'Layout cleared — Undo to restore'));
}

/* 侧栏开合：which = 'lib' | 'panel' | null，open 不传则切换。
 * 宽屏：侧栏在布局中收起 / 展开（记住选择）；窄屏：侧栏是浮层抽屉，一次只开一个，which = null 表示全部关闭 */
const PANES = 'huxing-panes';
const panes = (() => { try { return JSON.parse(localStorage.getItem(PANES)) || {}; } catch(e) { return {}; } })();
function drawer(which, open){
  const app = $('.app'), els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  if (n){
    Object.entries(els).forEach(([k, el]) => el.classList.toggle('open', k === which && (open ?? !el.classList.contains('open'))));
  } else {
    Object.values(els).forEach(el => el.classList.remove('open'));
    if (which){
      const k = which === 'lib' ? 'hideLib' : 'hidePanel';
      panes[k] = open === undefined ? !panes[k] : !open;
      try { localStorage.setItem(PANES, JSON.stringify(panes)); } catch(e) {}
    }
  }
  app.classList.toggle('hide-lib', !!panes.hideLib); app.classList.toggle('hide-panel', !!panes.hidePanel);
  syncPaneBtns();
}
function syncPaneBtns(){
  const els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  const vis = k => n ? els[k].classList.contains('open') : !panes[k === 'lib' ? 'hideLib' : 'hidePanel'];
  $('#tgLib').classList.toggle('on', vis('lib')); $('#tgPanel').classList.toggle('on', vis('panel'));
  $('#tgLib').title = vis('lib') ? tr('收起家具库 ( [ )', 'Hide library ( [ )') : tr('展开家具库 ( [ )', 'Show library ( [ )');
  $('#tgPanel').title = vis('panel') ? tr('收起属性面板 ( ] )', 'Hide properties ( ] )') : tr('展开属性面板 ( ] )', 'Show properties ( ] )');
  $('#stage').classList.toggle('drawer-panel', n && vis('panel'));
}
function closeDrawers(){ if (narrow()) drawer(null); }

/* ======================= 操作 ======================= */
function rotateSel(d){ if (ui.sel?.kind==='furn') mutate(() => { const f = getF(ui.sel.id); f.rot = norm(f.rot + d); }); }
function deleteSel(){ if (ui.sel?.kind==='furn'){ const id = ui.sel.id; select(null); mutate(() => { state.furniture = state.furniture.filter(f => f.id !== id); }); } }
function duplicateSel(){
  if (ui.sel?.kind !== 'furn') return;
  const f = getF(ui.sel.id), n = {...f, id:uid(), cx:f.cx+200, cy:f.cy+200};
  mutate(() => state.furniture.push(n));
  select({kind:'furn', id:n.id});
}
// 新放下的家具若压在墙 / 窗上，沿穿透较浅的方向推出来，刚好贴墙
function pushOut(f){
  for (let n = 0; n < 4; n++){
    let moved = false;
    for (const r of snapRects()){
      const {hw, hh} = aabb(f), ox = Math.min(f.cx+hw, r[2]) - Math.max(f.cx-hw, r[0]), oy = Math.min(f.cy+hh, r[3]) - Math.max(f.cy-hh, r[1]);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) f.cx = f.cx < (r[0]+r[2])/2 ? r[0]-hw : r[2]+hw;
      else f.cy = f.cy < (r[1]+r[3])/2 ? r[1]-hh : r[3]+hh;
      moved = true;
    }
    if (!moved) return;
  }
}
function addItem(it, x, y){
  const [type,name,w,d,color] = it, f = F(type,name,Math.round(x/10)*10,Math.round(y/10)*10,w,d,0,color);
  pushOut(f);
  mutate(() => type==='rug' ? state.furniture.unshift(f) : state.furniture.push(f));
  select({kind:'furn', id:f.id});
  toast(tr(`已添加「${name}」${w}×${d}`, `Added "${nm(name)}" ${w}×${d}`));
}
function toggleWall(id){
  // 可编辑户型：拆改 = 从 geometry 删除并重算房间
  if (isEditablePlan()) {
    const idx = (state.geometry?.wallIds || WALL_IDS).indexOf(id);
    if (idx < 0) return;
    const w = state.geometry.walls[idx];
    mutate(() => {
      if (!state.geometry) state.geometry = snapshotGeometry();
      state.geometry.walls.splice(idx, 1);
      state.geometry.wallIds.splice(idx, 1);
      rebuildEditableGeometry(state);
    });
    toast(tr(`已删除墙体 ${Math.round(wallLengthMm(w))} mm · 房间已更新`, `Removed wall ${Math.round(wallLengthMm(w))} mm · rooms updated`));
    return;
  }
  // 模板户型上的 extraWalls
  if (String(id).startsWith('ew')) {
    const w = (state.extraWalls || []).find(x => x.id === id);
    if (!w) return;
    mutate(() => { state.extraWalls = state.extraWalls.filter(x => x.id !== id); });
    toast(tr(`已删除自建墙 ${Math.round(wallLengthMm(w))} mm`, `Removed custom wall ${Math.round(wallLengthMm(w))} mm`));
    return;
  }
  const w = wallById(id);
  if (!w) return;
  if (w[4]==='b') return toast(tr('承重墙（黑色）不可拆除', 'Load-bearing walls (black) cannot be removed'));
  if (w[4]==='e') return toast(tr('外墙属于建筑外围护结构，不建议拆除', 'Exterior walls are part of the building envelope and should not be removed'));
  const on = state.demolished.includes(id);
  mutate(() => state.demolished = on ? state.demolished.filter(x => x!==id) : [...state.demolished, id]);
  toast(on ? tr('已恢复墙体', 'Wall restored') : tr(`已标记拆除 ${Math.max(w[2]-w[0], w[3]-w[1])} mm 墙体`, `Marked ${Math.max(w[2]-w[0], w[3]-w[1])} mm of wall for removal`));
}

function snapWallPoint(p, origin){
  const q = snapPoint(p, false);
  if (!origin) return q;
  if (Math.abs(q.x - origin.x) >= Math.abs(q.y - origin.y)) return { x: q.x, y: origin.y };
  return { x: origin.x, y: q.y };
}

function commitDrawnWall(a, b){
  const rect = segmentToWallRect(a, b, WALL_THICK);
  if (!rect) {
    toast(tr('墙段太短（至少 200 mm）', 'Wall too short (min 200 mm)'));
    return false;
  }
  if (isEditablePlan()) {
    if (!WALLS.length) {
      toast(tr('请先用「外框」画出外围墙', 'Draw an outer frame first'));
      return false;
    }
    const id = 'ew' + uid().slice(1);
    let roomCount = 0;
    mutate(() => {
      if (!state.geometry) state.geometry = snapshotGeometry();
      state.geometry.walls.push([rect.x0, rect.y0, rect.x1, rect.y1, 'n']);
      state.geometry.wallIds.push(id);
      roomCount = rebuildEditableGeometry(state).roomCount;
    });
    toast(tr(`已添加隔墙 · 识别到 ${roomCount} 个房间`, `Partition added · ${roomCount} room(s) detected`));
    return true;
  }
  const wall = { id: 'ew' + uid().slice(1), ...rect, kind: 'n' };
  mutate(() => {
    if (!state.extraWalls) state.extraWalls = [];
    state.extraWalls.push(wall);
  });
  toast(tr(`已添加隔墙 ${Math.round(wallLengthMm(wall))} × ${WALL_THICK} mm`, `Added partition ${Math.round(wallLengthMm(wall))} × ${WALL_THICK} mm`));
  return true;
}

function commitFrame(a, b){
  const walls = outerFrameWalls(a.x, a.y, b.x, b.y, FRAME_THICK);
  if (!walls) {
    toast(tr(`外框至少 ${FRAME_MIN / 1000} m × ${FRAME_MIN / 1000} m`, `Frame must be at least ${FRAME_MIN / 1000} m × ${FRAME_MIN / 1000} m`));
    return false;
  }
  if (WALLS.length && !confirm(tr(
    '重新绘制外框将替换当前全部墙体与房间（可撤销）。继续？',
    'Redrawing the frame replaces all walls and rooms (undoable). Continue?'
  ))) return false;
  let roomCount = 0;
  mutate(() => {
    state.geometry = snapshotGeometry();
    state.geometry.walls = walls;
    state.geometry.wallIds = walls.map((_, i) => 'fw' + i);
    state.geometry.windows = [];
    state.geometry.doors = [];
    state.geometry.slides = [];
    state.geometry.lintels = [];
    state.geometry.entryMark = null;
    state.demolished = [];
    state.extraWalls = [];
    roomCount = rebuildEditableGeometry(state).roomCount;
  });
  fitView();
  renderOpenings();
  renderDims();
  toast(tr(`已创建外框（墙厚 ${FRAME_THICK} mm）· ${roomCount} 个房间`, `Frame created (${FRAME_THICK} mm walls) · ${roomCount} room(s)`));
  return true;
}

function syncEditableUi(){
  const ed = isEditablePlan();
  document.querySelectorAll('[data-editable-only]').forEach(el => { el.hidden = !ed; });
  if (!ed && (ui.tool === 'frame')) setTool('select');
}

function setTool(t){
  if (t === 'frame' && !isEditablePlan()) {
    toast(tr('请先在「户型」菜单切换到「空白户型」', 'Switch to Blank plan in the Plan menu first'));
    return;
  }
  ui.tool = t; ui.mA = null; ui.mCur = null;
  svg.setAttribute('class', 'tool-' + t);
  document.querySelectorAll('#tools .btn').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  syncModeHint();
  renderMeasure();
  renderWalls();
}
function syncModeHint(){
  const hints = {select:'',
    measure:COARSE ? tr('按住拖出测量线，或依次点两点 · 靠近墙面自动吸附 · 点「选择」退出', 'Hold and drag a line, or tap two points · snaps to walls · tap "Select" to exit')
      : tr('点击两点（或按住拖动）测量距离 · 靠近墙面自动吸附 · Shift 锁定水平/垂直 · Esc 取消', 'Click two points (or drag) to measure · snaps to walls · Shift locks horizontal/vertical · Esc cancels'),
    frame:tr('拖出矩形作为外墙（厚 240mm，至少 3m×3m）· 完成后可用「画墙」加隔墙自动分间', 'Drag a rectangle for exterior walls (240mm, min 3×3m) · then use Wall to split rooms'),
    wall:isEditablePlan()
      ? tr('点击两点画隔墙 · 自动水平/垂直 · 厚 120mm · 松手后自动识别房间', 'Click two points for a partition · H/V · 120mm · rooms update automatically')
      : tr('点击两点（或拖动）画轴对齐隔墙 · 自动吸附墙角 · 厚度 120mm · Esc 取消 · 「拆改」可删自建墙', 'Click two points (or drag) for an axis-aligned partition · snaps to walls · 120mm thick · Esc cancels · Demolish deletes custom walls'),
    demolish:isEditablePlan()
      ? tr('点击任意墙体删除，并重新识别房间', 'Click any wall to delete it and rebuild rooms')
      : tr('点击灰色非承重墙标记拆除，再次点击恢复 · 绿色自建墙点击即删 · 黑色承重墙不可拆', 'Click grey non-bearing walls to remove/restore · green custom walls delete on click · black bearing walls stay')};
  const h = $('#modehint'); h.textContent = hints[ui.tool]; h.classList.toggle('show', !!hints[ui.tool]);
}

/* ======================= 视图 ======================= */
function applyView(){
  const W = svg.clientWidth, H = svg.clientHeight;
  svg.setAttribute('viewBox', `${view.x0} ${view.y0} ${W/view.s} ${H/view.s}`);
  const ratio = 1/(view.s*PX_MM);
  $('#ratio').textContent = '1:' + Math.round(ratio);
  const nice = [100,200,500,1000,2000,5000].find(v => v*view.s >= 60) || 5000;
  $('#sbBar').style.width = nice*view.s + 'px';
  $('#sbText').textContent = nice >= 1000 ? `${nice/1000} m` : `${nice} mm`;
  renderSel(); renderMeasure();
}
function fitView(){
  const W = svg.clientWidth, H = svg.clientHeight;
  view.s = Math.min(W/BOUNDS.w, H/BOUNDS.h);
  view.x0 = BOUNDS.x - (W/view.s - BOUNDS.w)/2; view.y0 = BOUNDS.y - (H/view.s - BOUNDS.h)/2;
  applyView();
}
function zoomAt(ns, mx, my){
  ns = Math.max(.012, Math.min(2, ns));
  const px = view.x0 + mx/view.s, py = view.y0 + my/view.s;
  view.s = ns; view.x0 = px - mx/ns; view.y0 = py - my/ns; applyView();
}
const zoomCenter = k => zoomAt(view.s*k, svg.clientWidth/2, svg.clientHeight/2);
const setRatio = r => zoomAt(1/(r*PX_MM), svg.clientWidth/2, svg.clientHeight/2);

function toMM(e){
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* ======================= 吸附 ======================= */
const grid = () => 10;
function snapMove(f, cx, cy){
  let nx = Math.round(cx/grid())*grid(), ny = Math.round(cy/grid())*grid();
  if (!ui.layers.wallSnap) return [nx, ny];
  const {hw, hh} = aabb(f), tol = 10/view.s;
  let bx = tol, by = tol;
  for (const r of snapRects()){
    if (!(r[3] < cy-hh-tol || r[1] > cy+hh+tol)) for (const ex of [r[0], r[2]]) for (const c of [ex+hw, ex-hw]) if (Math.abs(c-cx) < bx){ bx = Math.abs(c-cx); nx = c; }
    if (!(r[2] < cx-hw-tol || r[0] > cx+hw+tol)) for (const ey of [r[1], r[3]]) for (const c of [ey+hh, ey-hh]) if (Math.abs(c-cy) < by){ by = Math.abs(c-cy); ny = c; }
  }
  return [nx, ny];
}
function snapPoint(p, shift){
  let x = Math.round(p.x/10)*10, y = Math.round(p.y/10)*10;
  const tol = 8/view.s; let bx = tol, by = tol;
  for (const r of snapRects()){
    for (const ex of [r[0], r[2]]) if (Math.abs(ex-p.x) < bx){ bx = Math.abs(ex-p.x); x = ex; }
    for (const ey of [r[1], r[3]]) if (Math.abs(ey-p.y) < by){ by = Math.abs(ey-p.y); y = ey; }
  }
  if (shift && ui.mA){ if (Math.abs(x-ui.mA.x) > Math.abs(y-ui.mA.y)) y = ui.mA.y; else x = ui.mA.x; }
  return {x, y};
}

/* ======================= 指针交互 ======================= */
let drag = null, pinch = null;
const touches = new Map();                     // 当前按在平面图上的手指
const svgXY = (x, y) => { const r = svg.getBoundingClientRect(); return [x - r.left, y - r.top]; };
function pinchInfo(){
  const [a, b] = [...touches.values()];
  return {d:Math.max(1, Math.hypot(b.x-a.x, b.y-a.y)), c:svgXY((a.x+b.x)/2, (a.y+b.y)/2)};
}
// 结束当前拖动：移动过的家具记入撤销栈
function endDrag(cancel){
  const d = drag; drag = null; svg.classList.remove('panning');
  if (!d) return;
  if (d.kind === 'measure'){
    if (cancel){ ui.mA = ui.mCur = null; renderMeasure(); return; }
    if (d.moved && ui.mA && ui.mCur && Math.hypot(ui.mCur.x-ui.mA.x, ui.mCur.y-ui.mA.y) > 20){
      const a = ui.mA, b = ui.mCur; ui.mA = ui.mCur = null; mutate(() => state.measures.push({a, b}));
    }
    renderMeasure(); return;                   // 没拖动：保留起点，等第二次点击
  }
  if (d.kind === 'wall'){
    if (cancel){ ui.mA = ui.mCur = null; renderWalls(); return; }
    if (d.moved && ui.mA && ui.mCur){
      const a = ui.mA, b = ui.mCur; ui.mA = ui.mCur = null;
      commitDrawnWall(a, b);
    }
    renderWalls(); return;
  }
  if (d.kind === 'frame'){
    if (cancel){ ui.mA = ui.mCur = null; renderWalls(); return; }
    if (d.moved && ui.mA && ui.mCur){
      const a = ui.mA, b = ui.mCur; ui.mA = ui.mCur = null;
      commitFrame(a, b);
    }
    renderWalls(); return;
  }
  if (d.kind === 'pan'){
    if (!cancel && !d.moved && ui.tool === 'select') select(d.room ? {kind:'room', id:d.room} : null);
    return;
  }
  if (d.moved){ commit(d.before); renderAll(); }
}



/* ======================= 家具库拖放（列表由 FurnitureLibrary.vue 渲染） ======================= */
let libDrag = null;
/** @param {any[]} it LIB item tuple @param {PointerEvent} e */
function beginLibDrag(it, e) {
  if (e.button) return;
  const el = e.currentTarget || e.target?.closest?.('.item');
  libDrag = { el, id: e.pointerId, sx: e.clientX, sy: e.clientY, it, ghost: null };
}
// 屏幕坐标 → 户型坐标（mm）。2D 取平面图坐标，3D 取射线与地面的交点；s = 该处每 mm 的屏幕像素数
function dropPoint(x, y){
  const r = $('#stage').getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  if (document.elementFromPoint(x, y)?.closest('aside.open,#fab,#walkOverlay,#joy,#walkExit')) return null;
  if (is3D()) return bridge.View3D?.groundAt(x, y) || null;
  const p = toMM({clientX:x, clientY:y}); return {x:p.x, y:p.y, s:view.s};
}


/* ======================= 导入导出 ======================= */
function download(name, blob){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function exportPNG(){
  if (is3D()) return bridge.View3D.shot();
  const clone = svg.cloneNode(true), W = 3200, H = Math.round(W*BOUNDS.h/BOUNDS.w);
  clone.setAttribute('viewBox', `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.querySelector('#gSel').innerHTML = '';
  clone.querySelector('#gGrid').innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid?'url(#grid)':'#f7f4ee'}"/>`;
  const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
  Object.entries({x:-20000,y:-20000,width:55000,height:55000,fill:'#f7f4ee'}).forEach(([k,v]) => bg.setAttribute(k,v));
  clone.insertBefore(bg, clone.querySelector('#gGrid'));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    cv.toBlob(b => download(tr('户型装修方案', 'floor-plan-design') + '.png', b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
}

/* ======================= 杂项 ======================= */
/* toast 由 store/design.js 提供，Toast.vue 渲染 */

/* 全屏：标准 API + Safari（iPad）的 webkit 前缀版本 */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen(){
  const de = document.documentElement;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) return toast(tr('当前浏览器不支持网页全屏，可在 Safari 中「添加到主屏幕」后以全屏方式打开', 'Fullscreen is not supported here — in Safari, use "Add to Home Screen" to open it fullscreen'));
    Promise.resolve(req.call(de)).catch(() => toast(tr('无法进入全屏', 'Could not enter fullscreen')));
  }
}
function syncFullscreen(){
  const on = !!fsEl(), b = $('#fullscreen');
  b.textContent = '⛶ ' + (on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen'));
  b.title = (on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen')) + ' (Shift+F)';
}


/* ======================= 2D / 3D 切换 ======================= */
let viewMode = '2d', switching = false;
const is3D = () => viewMode === '3d';
const TIPS = () => COARSE
  ? {'2d':tr('点或拖动家具库添加 · 单指拖动平移 · 双指缩放 · 选中家具后底部工具条可旋转 / 复制 / 删除', 'Tap or drag from the library · 1 finger pans · pinch zooms · bottom bar rotates / duplicates / deletes'),
     '3d':tr('单指旋转 · 双指缩放 / 平移 · 点家具或地面编辑 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · tap furniture or floor to edit · tap doors to open')}
  : {'2d':tr('拖动左侧家具到平面图 · 滚轮缩放 · 拖动空白处平移 · T 切换 3D', 'Drag furniture onto the plan · scroll to zoom · drag empty space to pan · T for 3D'),
     '3d':tr('3D 场景与平面方案实时同步 · 右侧面板修改会立即生效 · T 返回 2D', '3D stays in sync with the plan · panel edits apply instantly · T for 2D')};
async function setView(m){
  if (m === viewMode || switching) return;
  if (!bridge.View3D) return toast(tr('3D 引擎仍在加载或加载失败', '3D engine is still loading or failed to load'));
  switching = true; document.body.classList.add('busy');
  viewMode = m;
  if (m === '3d'){ if (ui.tool !== 'select') setTool('select'); ui.mA = null; document.body.classList.add('m3d'); await bridge.View3D.enter(); }
  else { document.body.classList.remove('m3d'); await bridge.View3D.exit(); applyView(); }
  $('#tip').textContent = TIPS()[m];
  switching = false; document.body.classList.remove('busy');
}


function setLang(l){
  setLANG(l); try { localStorage.setItem(LANG_KEY, l); } catch(e) {}
  applyStaticLang(); syncFullscreen(); syncModeHint(); syncPaneBtns();
  buildPlanMenu(); syncBrand();
  renderOpenings(); renderAll();
  $('#tip').textContent = TIPS()[viewMode];
  bridge.View3D?.relang();
}


function bindAll() {
svg.addEventListener('pointerdown', e => {
  if (e.button === 1 || e.button === 2) return;
  closeDrawers(); document.querySelectorAll('details.menu').forEach(m => { m.open = false; });
  if (e.pointerType !== 'mouse'){
    touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
    svg.setPointerCapture(e.pointerId);
    if (touches.size >= 2){                    // 第二根手指落下：取消单指操作，进入双指缩放 / 平移
      endDrag(drag?.kind === 'measure' || drag?.kind === 'wall' || drag?.kind === 'frame' || drag?.kind === 'pan');
      const {d, c} = pinchInfo();
      pinch = {d, c, s:view.s, px:view.x0 + c[0]/view.s, py:view.y0 + c[1]/view.s};
      return;
    }
  }
  if (pinch) return;
  const p = toMM(e), t = e.target;
  if (ui.tool === 'measure'){
    const q = snapPoint(p, e.shiftKey);
    if (!ui.mA){ ui.mA = q; ui.mCur = q; drag = {kind:'measure', sx:e.clientX, sy:e.clientY, moved:false}; svg.setPointerCapture(e.pointerId); }
    else { const a = ui.mA; ui.mA = null; ui.mCur = null; if (Math.hypot(q.x-a.x, q.y-a.y) > 20) mutate(() => state.measures.push({a, b:q})); }
    renderMeasure(); return;
  }
  if (ui.tool === 'wall'){
    const q = snapWallPoint(p, ui.mA);
    if (!ui.mA){ ui.mA = q; ui.mCur = q; drag = {kind:'wall', sx:e.clientX, sy:e.clientY, moved:false}; svg.setPointerCapture(e.pointerId); }
    else { const a = ui.mA; ui.mA = null; ui.mCur = null; commitDrawnWall(a, q); }
    renderWalls(); return;
  }
  if (ui.tool === 'frame'){
    const q = snapPoint(p, false);
    if (!ui.mA){ ui.mA = q; ui.mCur = q; drag = {kind:'frame', sx:e.clientX, sy:e.clientY, moved:false}; svg.setPointerCapture(e.pointerId); }
    else { const a = ui.mA; ui.mA = null; ui.mCur = null; commitFrame(a, q); }
    renderWalls(); return;
  }
  const h = t.closest('[data-handle]');
  if (h && ui.sel?.kind === 'furn'){
    drag = {kind:h.dataset.handle, id:ui.sel.id, sx:e.clientX, sy:e.clientY, before:snap(), moved:false};
  } else if (ui.tool === 'demolish' && t.closest('[data-wall]')){
    toggleWall(t.closest('[data-wall]').dataset.wall); return;
  } else if (ui.tool === 'select' && t.closest('[data-fid]')){
    const f = getF(t.closest('[data-fid]').dataset.fid);
    if (ui.sel?.id !== f.id) select({kind:'furn', id:f.id});
    drag = {kind:'move', id:f.id, sx:e.clientX, sy:e.clientY, ox:p.x-f.cx, oy:p.y-f.cy, before:snap(), moved:false};
  } else {
    const room = t.closest('[data-room]');
    drag = {kind:'pan', sx:e.clientX, sy:e.clientY, x0:view.x0, y0:view.y0, room:room && room.dataset.room, moved:false};
  }
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pinch){
    if (touches.size < 2) return;
    const {d, c} = pinchInfo(), ns = Math.max(.012, Math.min(2, pinch.s * d / pinch.d));
    view.s = ns; view.x0 = pinch.px - c[0]/ns; view.y0 = pinch.py - c[1]/ns; applyView();
    return;
  }
  const p = toMM(e);
  $('#cx').textContent = Math.round(p.x) + ' mm'; $('#cy').textContent = Math.round(p.y) + ' mm';
  if (!drag){
    const room = e.target.closest && e.target.closest('[data-room]');
    $('#hover').innerHTML = room ? `<b>${esc(state.rooms[room.dataset.room]?.name || ROOMS.find(r=>r.id===room.dataset.room)?.name || '')}</b> ${fmt(area(ROOMS.find(r=>r.id===room.dataset.room).poly))} m²` : '';
    if (ui.tool === 'measure' && ui.mA){ ui.mCur = snapPoint(p, e.shiftKey); renderMeasure(); }
    if (ui.tool === 'wall' && ui.mA){ ui.mCur = snapWallPoint(p, ui.mA); renderWalls(); }
    if (ui.tool === 'frame' && ui.mA){ ui.mCur = snapPoint(p, false); renderWalls(); }
    return;
  }
  const far = Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy) >= TAP;
  if (drag.kind === 'measure'){
    if (far) drag.moved = true;
    ui.mCur = snapPoint(p, e.shiftKey); renderMeasure(); return;
  }
  if (drag.kind === 'wall'){
    if (far) drag.moved = true;
    ui.mCur = snapWallPoint(p, ui.mA); renderWalls(); return;
  }
  if (drag.kind === 'frame'){
    if (far) drag.moved = true;
    ui.mCur = snapPoint(p, false); renderWalls(); return;
  }
  if (drag.kind === 'pan'){
    if (!drag.moved && !far) return;
    drag.moved = true; svg.classList.add('panning');
    view.x0 = drag.x0 - (e.clientX-drag.sx)/view.s; view.y0 = drag.y0 - (e.clientY-drag.sy)/view.s; applyView(); return;
  }
  const f = getF(drag.id); if (!f) return;
  if (!drag.moved && !far) return;             // 轻点家具不应让它抖动一下
  drag.moved = true;
  if (drag.kind === 'move'){
    [f.cx, f.cy] = snapMove(f, p.x-drag.ox, p.y-drag.oy);
  } else if (drag.kind === 'rot'){
    let a = Math.atan2(p.y-f.cy, p.x-f.cx)*180/Math.PI + 90;
    f.rot = norm(e.shiftKey ? a : Math.round(a/15)*15);
  } else if (drag.kind === 'size'){
    const a = f.rot*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
    const dx = p.x-f.cx, dy = p.y-f.cy, lx = dx*c + dy*s, ly = -dx*s + dy*c;
    const ax = -f.w/2, ay = -f.d/2;
    const nw = Math.max(100, Math.round((lx-ax)/10)*10), nd = Math.max(100, Math.round((ly-ay)/10)*10);
    const mx = ax + nw/2, my = ay + nd/2;
    f.cx += mx*c - my*s; f.cy += mx*s + my*c; f.w = nw; f.d = nd;
  }
  renderFurn(); renderSel();
});

function onPointerEnd(e){
  touches.delete(e.pointerId);
  if (pinch){ if (touches.size < 2) pinch = null; return; }   // 双指结束后，剩下的手指不再触发操作
  endDrag(e.type === 'pointercancel');
}
svg.addEventListener('pointerup', onPointerEnd);
svg.addEventListener('pointercancel', onPointerEnd);
// 阻止 iPad Safari 把双指手势当成整页缩放
['gesturestart','gesturechange','gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault()));

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAt(view.s*Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)), e.clientX-r.left, e.clientY-r.top);
}, {passive:false});
svg.addEventListener('dblclick', e => { if (ui.tool==='select' && e.target.closest('[data-fid]')) rotateSel(90); });
svg.addEventListener('contextmenu', e => {
  if (ui.tool === 'measure'){ e.preventDefault(); ui.mA = ui.mCur = null; renderMeasure(); }
  if (ui.tool === 'wall' || ui.tool === 'frame'){ e.preventDefault(); ui.mA = ui.mCur = null; renderWalls(); }
});


/* ======================= 键盘 ======================= */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  if (bridge.View3D?.walking()) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y'){ e.preventDefault(); redo(); return; }
  if (mod && k === 'd'){ e.preventDefault(); duplicateSel(); return; }
  if (mod) return;
  if (k === '[' || k === ']'){ drawer(k === '[' ? 'lib' : 'panel'); return; }
  if (k === 'f' && e.shiftKey){ toggleFullscreen(); return; }
  if (k === 't') setView(is3D() ? '2d' : '3d');
  else if (is3D() && ['v','m','w','b','x','f','+','=','-'].includes(k)) return;
  else if (k === 'v') setTool('select');
  else if (k === 'm') setTool('measure');
  else if (k === 'w') setTool('wall');
  else if (k === 'b') setTool('frame');
  else if (k === 'x') setTool('demolish');
  else if (k === 'f') fitView();
  else if (k === 'r') rotateSel(e.shiftKey ? -90 : 90);
  else if (k === 'delete' || k === 'backspace'){ e.preventDefault(); deleteSel(); }
  else if (k === 'escape'){
    if (ui.mA){ ui.mA = ui.mCur = null; renderMeasure(); renderWalls(); }
    else { if (ui.tool !== 'select') setTool('select'); select(null); }
  }
  else if (k.startsWith('arrow') && ui.sel?.kind === 'furn'){
    e.preventDefault(); const st = e.shiftKey ? 100 : 10;
    mutate(() => { const f = getF(ui.sel.id); if (k==='arrowleft') f.cx -= st; if (k==='arrowright') f.cx += st; if (k==='arrowup') f.cy -= st; if (k==='arrowdown') f.cy += st; });
  }
  else if (k === '+' || k === '=') zoomCenter(1.25);
  else if (k === '-') zoomCenter(.8);
});


addEventListener('pointermove', e => {
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const {it} = libDrag;
  if (!libDrag.ghost){
    if (Math.hypot(e.clientX-libDrag.sx, e.clientY-libDrag.sy) < TAP) return;
    const g = libDrag.ghost = document.createElement('div'); g.id = 'ghost';
    g.innerHTML = `<svg viewBox="${-it[2]/2} ${-it[3]/2} ${it[2]} ${it[3]}">${furnSVG(it[0],it[2],it[3],it[4])}</svg>`;
    document.body.appendChild(g); libDrag.el?.classList?.add('dragging');
  }
  // 幽灵图按落点处的比例显示真实大小（3D 中近大远小）
  const g = libDrag.ghost, s = Math.max(dropPoint(e.clientX, e.clientY)?.s || (is3D() ? .05 : view.s), .02);
  Object.assign(g.style, {width:Math.max(28, it[2]*s)+'px', height:Math.max(20, it[3]*s)+'px', left:e.clientX+'px', top:e.clientY+'px'});
  const lib = $('aside.lib');
  if (narrow() && lib.classList.contains('open') && e.clientX > lib.getBoundingClientRect().right) drawer(null);   // 拖出抽屉后自动收起
});
function endLibDrag(e, ok){
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const d = libDrag; libDrag = null;
  d.el?.classList?.remove('dragging');
  if (d.ghost){
    d.ghost.remove();
    if (!ok) return;
    const p = dropPoint(e.clientX, e.clientY);
    if (p) addItem(d.it, p.x, p.y);
    else if (is3D() && e.clientX > $('#stage').getBoundingClientRect().left) toast(tr('请拖到地面上', 'Drop it on the floor'));
    return;
  }
  if (!ok) return;
  // 轻点：放到选中房间中心，否则放到画面中心（3D 取屏幕中心对应的地面位置）
  let p = null;
  if (ui.sel?.kind === 'room'){ const b = bbox(ROOMS.find(r => r.id===ui.sel.id).poly); p = {x:(b[0]+b[2])/2, y:(b[1]+b[3])/2}; }
  else if (is3D()){ const r = $('#stage').getBoundingClientRect(); p = bridge.View3D.groundAt(r.left + r.width/2, r.top + r.height/2); }
  if (!p) p = {x:view.x0 + svg.clientWidth/2/view.s, y:view.y0 + svg.clientHeight/2/view.s};
  addItem(d.it, p.x, p.y);
  closeDrawers();
}
addEventListener('pointerup', e => endLibDrag(e, true));
addEventListener('pointercancel', e => endLibDrag(e, false));


document.querySelectorAll('.menu-pop .btn').forEach(b => b.addEventListener('click', () => b.closest('details').open = false));
document.querySelectorAll('#viewSeg .btn').forEach(b => b.onclick = () => setView(b.dataset.view));

document.querySelectorAll('#tools .btn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('#layers .btn').forEach(b => b.onclick = () => {
  const k = b.dataset.layer; ui.layers[k] = !ui.layers[k]; b.classList.toggle('on', ui.layers[k]);
  if (k === 'dims') $('#gDims').setAttribute('display', ui.layers.dims ? 'inline' : 'none');
  else if (k !== 'wallSnap') renderAll();
});
$('#zoomIn').onclick = () => zoomCenter(1.25);
$('#zoomOut').onclick = () => zoomCenter(.8);
$('#fit').onclick = fitView;
$('#s60').onclick = () => { setRatio(60); toast(tr('已按 1:60 显示（与原始户型图同比例）', 'Showing at 1:60 (same scale as the original plan)')); };
$('#s100').onclick = () => setRatio(100);
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#clearAll').onclick = clearLayout;

/* fullscreen fns hoisted */
$('#fullscreen').onclick = toggleFullscreen;
['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, syncFullscreen));
// 已从主屏幕以独立 App 方式打开时本就是全屏，隐藏按钮
if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) $('#fullscreen').hidden = true;
$('#tgLib').onclick = () => drawer('lib');
$('#tgPanel').onclick = () => drawer('panel');
// 触屏上点菜单以外的地方收起下拉菜单
document.addEventListener('pointerdown', e => {
  document.querySelectorAll('details.menu').forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; });
});
matchMedia('(max-width:1100px)').addEventListener('change', () => drawer(null));
drawer(null);                                  // 恢复上次的面板收起状态
buildPlanMenu();
$('#exportPng').onclick = exportPNG;
$('#exportJson').onclick = () => {
  const payload = { ...state, version: 2, planId: getActivePlanId() };
  download(tr('户型装修方案', 'floor-plan-design') + '.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
};
$('#importJson').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  file.text().then(txt => {
    try {
      const s = JSON.parse(txt);
      if (!Array.isArray(s.furniture)) throw 0;
      const targetId = s.planId && hasPlan(s.planId) ? s.planId : getActivePlanId();
      if (targetId !== getActivePlanId()) {
        save();
        switchPlanId(targetId);
        bootstrapState(fixState(s));
        afterPlanChange();
        toast(tr('方案已导入（已切换户型）', 'Plan imported (floor plan switched)'));
      } else {
        const b = snap();
        replaceState(fixState(s));
        ui.sel = null;
        commit(b);
        toast(tr('方案已导入', 'Plan imported'));
      }
    } catch (err) { toast(tr('文件格式不正确', 'Invalid file format')); }
  });
  e.target.value = '';
};
$('#reset').onclick = () => {
  if (confirm(tr('恢复为默认设计方案？（可撤销）', 'Reset to the default design? (undoable)'))) {
    const b = snap();
    replaceState(defaultState());
    ui.sel = null;
    commit(b);
  }
};
// 横竖屏切换、表头换行等都会改变画布尺寸；尺寸从 0 恢复（如首次布局）时重新适应窗口
// 其余尺寸变化（收起 / 展开面板等）保持画面中心不动
let lastW = 0, lastH = 0;
new ResizeObserver(() => {
  const w = svg.clientWidth, h = svg.clientHeight; if (!w) return;
  if (!lastW) fitView();
  else { view.x0 -= (w - lastW)/2/view.s; view.y0 -= (h - lastH)/2/view.s; applyView(); }
  lastW = w; lastH = h;
}).observe(svg);

/* setLang hoisted */
$('#langSel').onclick = e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l && l !== LANG) setLang(l); };

applyStaticLang(); syncFullscreen();
buildDefs(); renderOpenings(); renderDims();
$('#tip').textContent = TIPS()['2d'];
fitView(); renderAll();



}

export function initPlan2D() {
  svg = $('#plan');
  bindAll();
  setStoreHooks({ renderCanvas: renderAll });
  setSelectHook(() => renderSel());
  applyStaticLang();
  syncFullscreen();
  syncEditableUi();
  buildDefs();
  renderOpenings();
  renderDims();
  $('#tip').textContent = TIPS()['2d'];
  fitView();
  renderAll();
  bridge.select = select;
  bridge.closeDrawers = closeDrawers;
  bridge.api = {
    state, ui, view, getF, snap, commit, mutate, save, snapMove,
    renderAll, select, closeDrawers, drawer, aabb, COARSE, TAP, tr, nm,
    ROOMS, WALLS, WINS, DOORS, SLIDES, MATS, $,
    rotateSel, deleteSel, duplicateSel, clearLayout, beginLibDrag,
  };
  window.select = select;
  window.closeDrawers = closeDrawers;
}

export { select, closeDrawers, setView, renderAll, is3D, snapMove };
