/**
 * 当前激活户型的运行时数据（可变数组，切换户型时原地替换）
 * 可编辑户型（blank）以 state.geometry 为源，经 applyGeometry 同步到此。
 */
import {
  MATS, LIB, typeColor, uid, F, R,
  PX_MM, COARSE, TAP, narrow,
  STATE_VERSION, META_KEY, LEGACY_STORE, storeKey,
} from './shared.js';
import { DEFAULT_PLAN_ID, getPlan, hasPlan, listPlans } from './plans/index.js';
import { detectRoomsFromWalls, inheritRoomMeta, metaFromWalls } from '../utils/roomsFromWalls.js';

export {
  MATS, LIB, typeColor, uid, F, R,
  PX_MM, COARSE, TAP, narrow,
  STATE_VERSION, META_KEY, LEGACY_STORE, storeKey,
  listPlans, getPlan, hasPlan, DEFAULT_PLAN_ID,
};

/** @deprecated 兼容旧 import；请用 storeKey(planId) */
export const STORE = LEGACY_STORE;

export const WALLS = [];
export const WALL_IDS = [];
export const WINS = [];
export const WIN_META = [];
export const DOORS = [];
export const SLIDES = [];
export const LINTELS = [];
export const ROOMS = [];
export const BOUNDS = { x: 0, y: 0, w: 10000, h: 10000 };
export const CENTER = { x: 5000, y: 5000 };
export const WALK_START = { pos: [0, 0], look: [1000, 0] };
export let ENTRY_MARK = null;
export let DIM_CHAINS = [];
export let PLAN_META = { id: '', name: '', nameEn: '', subtitle: '', subtitleEn: '', editable: false };

let _furnitureSrc = [];
let _activePlanId = DEFAULT_PLAN_ID;

export function getActivePlanId() {
  return _activePlanId;
}

export function isEditablePlan(planId = _activePlanId) {
  return !!getPlan(planId)?.editable;
}

export function wallKey(i) {
  return WALL_IDS[i] || ('w' + i);
}

export function wallById(id) {
  const i = WALL_IDS.indexOf(id);
  if (i >= 0) return WALLS[i];
  if (typeof id === 'string' && /^w\d+$/.test(id)) return WALLS[+id.slice(1)];
  return null;
}

function refill(target, src) {
  target.length = 0;
  if (src?.length) target.push(...src.map(item => (Array.isArray(item) ? [...item] : item)));
}

function cloneRooms(rooms) {
  return (rooms || []).map(r => ({
    ...r,
    poly: r.poly.map(p => [...p]),
    at: r.at ? [...r.at] : undefined,
  }));
}

/** 从当前运行时（或 plan）拍几何快照 */
export function snapshotGeometry() {
  return {
    walls: WALLS.map(w => [...w]),
    wallIds: [...WALL_IDS],
    windows: WINS.map((rect, i) => ({
      rect: [...rect],
      sill: WIN_META[i]?.sill ?? 0.9,
      head: WIN_META[i]?.head ?? 2.4,
    })),
    doors: DOORS.map(d => ({ ...d, rect: [...d.rect], h: [...d.h], c: [...d.c], o: [...d.o] })),
    slides: SLIDES.map(s => ({ ...s, rect: [...s.rect] })),
    lintels: LINTELS.map(l => ({ ...l, rect: [...l.rect] })),
    rooms: cloneRooms(ROOMS),
    bounds: { ...BOUNDS },
    center: [CENTER.x, CENTER.y],
    walkStart: { pos: [...WALK_START.pos], look: [...WALK_START.look] },
    entryMark: ENTRY_MARK ? { ...ENTRY_MARK, text: ENTRY_MARK.text ? [...ENTRY_MARK.text] : null, path: ENTRY_MARK.path } : null,
    dimChains: (DIM_CHAINS || []).map(c => ({ ...c, segs: [...c.segs] })),
  };
}

/**
 * 将几何写入运行时数组
 */
export function applyGeometry(g) {
  if (!g) return;
  refill(WALLS, g.walls || []);
  refill(WALL_IDS, g.wallIds || (g.walls || []).map((_, i) => 'w' + i));
  const wins = g.windows || [];
  refill(WINS, wins.map(w => (Array.isArray(w) ? w : w.rect)));
  refill(WIN_META, wins.map(w => (
    Array.isArray(w) ? { sill: 0.9, head: 2.4 } : { sill: w.sill ?? 0.9, head: w.head ?? 2.4 }
  )));
  refill(DOORS, g.doors || []);
  refill(SLIDES, g.slides || []);
  refill(LINTELS, g.lintels || []);
  refill(ROOMS, cloneRooms(g.rooms || []));
  if (g.bounds) Object.assign(BOUNDS, g.bounds);
  if (g.center) { CENTER.x = g.center[0]; CENTER.y = g.center[1]; }
  if (g.walkStart) {
    WALK_START.pos = [...g.walkStart.pos];
    WALK_START.look = [...g.walkStart.look];
  }
  ENTRY_MARK = g.entryMark || null;
  DIM_CHAINS = g.dimChains || [];
}

/**
 * 将某套户型几何写入运行时（不碰 localStorage / 方案 state）
 */
export function applyPlanGeometry(plan) {
  const p = plan || getPlan(_activePlanId);
  applyGeometry({
    walls: p.walls,
    wallIds: p.wallIds || (p.walls || []).map((_, i) => 'w' + i),
    windows: p.windows || [],
    doors: p.doors || [],
    slides: p.slides || [],
    lintels: p.lintels || [],
    rooms: p.rooms || [],
    bounds: p.bounds,
    center: p.center,
    walkStart: p.walkStart,
    entryMark: p.entryMark || null,
    dimChains: p.dimChains || [],
  });
  _furnitureSrc = p.furniture || [];
  PLAN_META = {
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    subtitle: p.subtitle,
    subtitleEn: p.subtitleEn,
    editable: !!p.editable,
  };
  _activePlanId = p.id;
}

/**
 * 可编辑户型：根据 walls 重建房间并写回 geometry + 运行时
 * @returns {{roomCount:number}}
 */
export function rebuildEditableGeometry(state) {
  if (!state.geometry) state.geometry = snapshotGeometry();
  const g = state.geometry;
  const activeWalls = (g.walls || []).filter((_, i) => !state.demolished?.includes(g.wallIds[i]));
  const detected = detectRoomsFromWalls(activeWalls);
  const prevRooms = g.rooms || [];
  g.rooms = inheritRoomMeta(detected, prevRooms, state.rooms);
  // 保证 wallIds 与 walls 对齐
  if (!g.wallIds || g.wallIds.length !== g.walls.length) {
    g.wallIds = g.walls.map((_, i) => g.wallIds?.[i] || ('w' + i));
  }
  const meta = metaFromWalls(g.walls);
  Object.assign(g, {
    bounds: meta.bounds,
    center: meta.center,
    walkStart: meta.walkStart,
    dimChains: meta.dimChains,
    windows: g.windows || [],
    doors: g.doors || [],
    slides: g.slides || [],
    lintels: g.lintels || [],
    entryMark: g.entryMark || null,
  });
  applyGeometry(g);
  // 同步 state.rooms 字典
  const rooms = {};
  ROOMS.forEach(r => {
    const prev = state.rooms?.[r.id];
    rooms[r.id] = { name: prev?.name || r.name, mat: prev?.mat || r.mat };
  });
  state.rooms = rooms;
  return { roomCount: ROOMS.length };
}

export function defaultFurniture() {
  return _furnitureSrc.map(args => F(...args));
}

export function defaultState() {
  const geometry = snapshotGeometry();
  const rooms = {};
  ROOMS.forEach(r => { rooms[r.id] = { name: r.name, mat: r.mat }; });
  return {
    version: STATE_VERSION,
    planId: _activePlanId,
    furniture: defaultFurniture(),
    rooms,
    demolished: [],
    measures: [],
    extraWalls: [],
    geometry,
  };
}

function readMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m?.activePlanId && hasPlan(m.activePlanId)) return m.activePlanId;
  } catch (e) { /* ignore */ }
  return DEFAULT_PLAN_ID;
}

export function saveMeta(planId = _activePlanId) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ activePlanId: planId }));
  } catch (e) { /* ignore */ }
}

function migrateLegacyIfNeeded(planId) {
  if (planId !== DEFAULT_PLAN_ID) return null;
  if (localStorage.getItem(storeKey(planId))) return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORE);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.furniture)) return null;
    s.version = STATE_VERSION;
    s.planId = planId;
    localStorage.setItem(storeKey(planId), JSON.stringify(s));
    return s;
  } catch (e) {
    return null;
  }
}

export function fixState(s) {
  const d = defaultState();
  let geometry = s.geometry;
  if (!geometry || !Array.isArray(geometry.walls)) {
    geometry = snapshotGeometry();
    // 把旧版 extraWalls 并入可编辑几何（仅 blank）
    if (isEditablePlan() && Array.isArray(s.extraWalls) && s.extraWalls.length) {
      for (const w of s.extraWalls) {
        geometry.walls.push([w.x0, w.y0, w.x1, w.y1, w.kind || 'n']);
        geometry.wallIds.push(w.id || ('ew' + uid().slice(1)));
      }
    }
  } else {
    geometry = {
      ...snapshotGeometry(),
      ...geometry,
      walls: geometry.walls.map(w => (Array.isArray(w) ? [...w] : [w.x0, w.y0, w.x1, w.y1, w.kind || 'n'])),
      wallIds: geometry.wallIds ? [...geometry.wallIds] : geometry.walls.map((_, i) => 'w' + i),
      rooms: cloneRooms(geometry.rooms || []),
    };
  }

  if (isEditablePlan()) {
    applyGeometry(geometry);
  }

  const rooms = Object.assign({}, d.rooms, s.rooms || {});
  for (const id of Object.keys(rooms)) {
    if (!ROOMS.some(r => r.id === id)) delete rooms[id];
  }
  ROOMS.forEach(r => {
    if (!rooms[r.id]) rooms[r.id] = { name: r.name, mat: r.mat };
  });

  const extraWalls = isEditablePlan()
    ? []
    : (Array.isArray(s.extraWalls)
      ? s.extraWalls.filter(w => w && typeof w.id === 'string'
        && Number.isFinite(w.x0) && Number.isFinite(w.y0) && Number.isFinite(w.x1) && Number.isFinite(w.y1))
      : []);

  return {
    version: STATE_VERSION,
    planId: _activePlanId,
    furniture: Array.isArray(s.furniture) ? s.furniture : d.furniture,
    rooms,
    demolished: isEditablePlan() ? [] : (s.demolished || []).filter(id => wallById(id)),
    measures: s.measures || [],
    extraWalls,
    geometry,
  };
}

export function load(planId = _activePlanId) {
  migrateLegacyIfNeeded(planId);
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(planId)));
    if (s && Array.isArray(s.furniture)) return fixState(s);
  } catch (e) { /* ignore */ }
  return null;
}

export function persistState(state) {
  const payload = {
    ...state,
    version: STATE_VERSION,
    planId: _activePlanId,
  };
  try {
    localStorage.setItem(storeKey(_activePlanId), JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

/**
 * 切换户型几何并写入 meta（调用方负责换 state / 重绘）
 */
export function switchPlanId(planId) {
  if (!hasPlan(planId) || planId === _activePlanId) return false;
  applyPlanGeometry(getPlan(planId));
  saveMeta(planId);
  return true;
}

// —— 启动：按 meta 激活户型 ——
applyPlanGeometry(getPlan(readMeta()));
saveMeta(_activePlanId);
