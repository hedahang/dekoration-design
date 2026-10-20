/**
 * 由轴对齐墙矩形推断室内封闭区域 → 房间多边形
 * 做法：把墙端点做成正交网格，墙体格 / 室外洪水填充，剩余连通域即房间。
 */

function rectOf(w) {
  if (Array.isArray(w)) return [w[0], w[1], w[2], w[3]];
  return [w.x0, w.y0, w.x1, w.y1];
}

function uniqSorted(nums, eps = 1) {
  const a = [...nums].sort((x, y) => x - y);
  const out = [];
  for (const n of a) {
    if (!out.length || Math.abs(n - out[out.length - 1]) > eps) out.push(n);
    else out[out.length - 1] = (out[out.length - 1] + n) / 2;
  }
  return out;
}

function stitchEdges(edges) {
  if (!edges.length) return null;
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  const byStart = new Map();
  for (const e of edges) {
    const k = key(e[0]);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(e);
  }
  const used = new Set();
  const startE = edges[0];
  const poly = [startE[0], startE[1]];
  used.add(startE);
  let guard = edges.length + 2;
  while (guard-- > 0) {
    const cur = poly[poly.length - 1];
    const cands = byStart.get(key(cur)) || [];
    const next = cands.find(e => !used.has(e));
    if (!next) break;
    used.add(next);
    poly.push(next[1]);
    if (key(next[1]) === key(poly[0]) && poly.length > 3) break;
  }
  if (poly.length > 1 && key(poly[0]) === key(poly[poly.length - 1])) poly.pop();
  return poly.length >= 3 ? poly : null;
}

function cellsToPoly(cells, X, Y) {
  const set = new Set(cells.map(([i, j]) => `${i},${j}`));
  const edges = [];
  for (const [i, j] of cells) {
    const x0 = X[i], x1 = X[i + 1], y0 = Y[j], y1 = Y[j + 1];
    if (!set.has(`${i},${j - 1}`)) edges.push([[x0, y0], [x1, y0]]);
    if (!set.has(`${i},${j + 1}`)) edges.push([[x1, y1], [x0, y1]]);
    if (!set.has(`${i - 1},${j}`)) edges.push([[x0, y1], [x0, y0]]);
    if (!set.has(`${i + 1},${j}`)) edges.push([[x1, y0], [x1, y1]]);
  }
  return stitchEdges(edges);
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function polyCentroid(poly) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const c = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * c;
    y += (p[1] + q[1]) * c;
    a += c;
  }
  if (Math.abs(a) < 1e-6) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  return [x / (3 * a), y / (3 * a)];
}

/**
 * @param {Array} walls [x0,y0,x1,y1,kind?][]
 * @returns {{id:string,name:string,poly:number[][],mat:string,at:number[]}[]}
 */
export function detectRoomsFromWalls(walls) {
  const rects = (walls || []).map(rectOf).filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0);
  if (!rects.length) return [];

  const xs = uniqSorted(rects.flatMap(([x0, , x1]) => [x0, x1]));
  const ys = uniqSorted(rects.flatMap(([, y0, , y1]) => [y0, y1]));
  if (xs.length < 2 || ys.length < 2) return [];

  const ni = xs.length - 1, nj = ys.length - 1;
  const blocked = Array.from({ length: ni }, () => Array(nj).fill(false));
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      blocked[i][j] = rects.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
    }
  }

  const mark = Array.from({ length: ni }, () => Array(nj).fill(0)); // 0 unknown, -1 outside, >0 room id
  const q = [];
  const tryPush = (i, j) => {
    if (i < 0 || j < 0 || i >= ni || j >= nj) return;
    if (blocked[i][j] || mark[i][j]) return;
    mark[i][j] = -1;
    q.push([i, j]);
  };
  for (let i = 0; i < ni; i++) { tryPush(i, 0); tryPush(i, nj - 1); }
  for (let j = 0; j < nj; j++) { tryPush(0, j); tryPush(ni - 1, j); }
  while (q.length) {
    const [i, j] = q.pop();
    tryPush(i + 1, j); tryPush(i - 1, j); tryPush(i, j + 1); tryPush(i, j - 1);
  }

  const rooms = [];
  let rid = 0;
  const MIN_AREA = 0.3e6; // 0.3 m² in mm²
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      if (blocked[i][j] || mark[i][j]) continue;
      rid += 1;
      const cells = [];
      const stack = [[i, j]];
      mark[i][j] = rid;
      while (stack.length) {
        const [ci, cj] = stack.pop();
        cells.push([ci, cj]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni2 = ci + di, nj2 = cj + dj;
          if (ni2 < 0 || nj2 < 0 || ni2 >= ni || nj2 >= nj) continue;
          if (blocked[ni2][nj2] || mark[ni2][nj2]) continue;
          mark[ni2][nj2] = rid;
          stack.push([ni2, nj2]);
        }
      }
      const poly = cellsToPoly(cells, xs, ys);
      if (!poly) continue;
      const a = polyArea(poly);
      if (a < MIN_AREA) continue;
      const at = polyCentroid(poly);
      const n = rooms.length + 1;
      rooms.push({
        id: 'r' + n,
        name: rooms.length === 0 ? '开放空间' : ('房间' + n),
        poly,
        mat: 'tile800',
        at: [Math.round(at[0]), Math.round(at[1])],
      });
    }
  }

  rooms.sort((a, b) => polyArea(b.poly) - polyArea(a.poly));
  if (rooms.length) {
    rooms[0].name = rooms.length === 1 ? '开放空间' : '客厅';
    rooms[0].id = 'living';
    rooms[0].mat = 'tile800';
    for (let i = 1; i < rooms.length; i++) {
      rooms[i].id = 'r' + (i + 1);
      rooms[i].name = '房间' + (i + 1);
      rooms[i].mat = 'wood';
    }
  }
  return rooms;
}

/** 用旧房间的名称/材质，按中心点落在哪间来继承 */
export function inheritRoomMeta(nextRooms, prevRooms, prevStateRooms) {
  return nextRooms.map(r => {
    const [cx, cy] = r.at || polyCentroid(r.poly);
    const hit = (prevRooms || []).find(p => pointInPoly(cx, cy, p.poly));
    if (hit) {
      const st = prevStateRooms?.[hit.id];
      return {
        ...r,
        id: hit.id,
        name: st?.name || hit.name || r.name,
        mat: st?.mat || hit.mat || r.mat,
      };
    }
    return r;
  });
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 由墙生成 bounds / center / walkStart / 简单尺寸链 */
export function metaFromWalls(walls, pad = 1500) {
  const rects = (walls || []).map(rectOf);
  if (!rects.length) {
    return {
      bounds: { x: -1500, y: -1500, w: 13000, h: 13000 },
      center: [5000, 5000],
      walkStart: { pos: [5000, 9000], look: [5000, 5000] },
      dimChains: [],
    };
  }
  const minX = Math.min(...rects.map(r => r[0]));
  const minY = Math.min(...rects.map(r => r[1]));
  const maxX = Math.max(...rects.map(r => r[2]));
  const maxY = Math.max(...rects.map(r => r[3]));
  const w = maxX - minX, h = maxY - minY;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return {
    bounds: { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 },
    center: [Math.round(cx), Math.round(cy)],
    walkStart: {
      pos: [Math.round(cx), Math.round(maxY - 400)],
      look: [Math.round(cx), Math.round(cy)],
    },
    dimChains: [
      { horiz: true, at: minY - 700, start: minX, segs: [Math.round(w)] },
      { horiz: false, at: minX - 700, start: minY, segs: [Math.round(h)] },
    ],
  };
}

export const FRAME_THICK = 240;
export const FRAME_MIN = 3000;

/** 拖拽矩形 → 四条外墙（边框落在矩形边上） */
export function outerFrameWalls(x0, y0, x1, y1, thick = FRAME_THICK) {
  const L = Math.min(x0, x1), R = Math.max(x0, x1);
  const T = Math.min(y0, y1), B = Math.max(y0, y1);
  if (R - L < FRAME_MIN || B - T < FRAME_MIN) return null;
  return [
    [L, T, R, T + thick, 'e'],
    [L, B - thick, R, B, 'e'],
    [L, T, L + thick, B, 'e'],
    [R - thick, T, R, B, 'e'],
  ];
}
