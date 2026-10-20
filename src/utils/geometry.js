import { WALLS, WINS, wallKey } from '../data/floorplan.js';
import { state } from '../store/design.js';

/* ======================= 几何工具 ======================= */
export const area = poly => Math.abs(poly.reduce((a,p,i) => { const q = poly[(i+1)%poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0)) / 2 / 1e6;
export const perim = poly => poly.reduce((a,p,i) => { const q = poly[(i+1)%poly.length]; return a + Math.hypot(q[0]-p[0], q[1]-p[1]); }, 0) / 1000;
export const bbox = poly => { const xs = poly.map(p=>p[0]), ys = poly.map(p=>p[1]); return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; };
export function aabb(f){ const a = f.rot*Math.PI/180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return {hw:f.w/2*c + f.d/2*s, hh:f.w/2*s + f.d/2*c}; }
export const fmt = (n, d=2) => n.toFixed(d);
export const norm = a => ((Math.round(a) % 360) + 360) % 360;

/** 自建隔墙默认厚度 mm */
export const WALL_THICK = 120;
export const WALL_MIN_LEN = 200;

export function planWallRects() {
  return WALLS.filter((w, i) => !state.demolished.includes(wallKey(i)));
}

/** 自建墙 → [x0,y0,x1,y1,kind] */
export function extraWallRects() {
  return (state.extraWalls || []).map(w => [w.x0, w.y0, w.x1, w.y1, w.kind || 'n']);
}

export function snapRects() {
  return planWallRects().concat(extraWallRects()).concat(WINS);
}

/**
 * 两点生成轴对齐墙矩形（取主方向，厚度居中）
 * @returns {{x0,y0,x1,y1}|null}
 */
export function segmentToWallRect(a, b, thick = WALL_THICK) {
  let ax = a.x, ay = a.y, bx = b.x, by = b.y;
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) by = ay;
  else bx = ax;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < WALL_MIN_LEN) return null;
  const h = thick / 2;
  if (Math.abs(by - ay) < 0.5) {
    return { x0: Math.min(ax, bx), y0: ay - h, x1: Math.max(ax, bx), y1: ay + h };
  }
  return { x0: ax - h, y0: Math.min(ay, by), x1: ax + h, y1: Math.max(ay, by) };
}

export function wallLengthMm(w) {
  const r = Array.isArray(w) ? w : [w.x0, w.y0, w.x1, w.y1];
  return Math.max(r[2] - r[0], r[3] - r[1]);
}
