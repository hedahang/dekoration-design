/**
 * 3D 场景引擎（three.js）
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  WALLS, WINS, WIN_META, DOORS, SLIDES, LINTELS, ROOMS, MATS, COARSE, TAP,
  CENTER, WALK_START, wallKey,
} from '../data/floorplan.js';
import { tr, nm } from '../i18n.js';
import { state, ui, view, getF, snap, commit } from '../store/design.js';
import { aabb, area, extraWallRects } from '../utils/geometry.js';
import { bridge } from './bridge.js';
import { buildFurniture, setMatApi } from './furniture3d.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 建筑用小几何（家具工具在 furniture3d.js，此处自备以免循环依赖） */
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const matOr = typeof m === 'string' ? mat(m) : m;
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matOr);
  o.castShadow = o.receiveShadow = true;
  o.position.set(x, y + h / 2, z);
  return o;
}
function metal() {
  return mat('#cfd2d4', { metalness: 0.9, roughness: 0.25 });
}

// snapMove lives in plan2d; resolve via bridge when dragging in 3D
function snapMove(f, x, y) {
  return bridge.api?.snapMove ? bridge.api.snapMove(f, x, y) : [x, y];
}
function renderAll() { bridge.api?.renderAll?.(); }


/* ============================================================
 *  3D 场景（three.js）—— 与 2D 共用 state / ui，切换时带过渡动画：
 *  2D → 3D：3D 相机先以正俯视对齐当前 2D 视口（比例、位置一致），
 *           交叉淡入后镜头倾斜环绕、墙体从地面升起、家具随后立起；
 *  3D → 2D：反向——家具收起、墙体下沉、镜头回到正俯视并淡出到平面图。
 * ============================================================ */
const stage = $('#stage'), host = $('#view3d');
let OX = CENTER.x, OY = CENTER.y;
const H = 2.8, FOV = 45;       // 户型中心放在世界原点，层高 2.8 m
const wx = x => (x - OX) / 1000, wz = y => (y - OY) / 1000, M = v => v / 1000;
const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
const opt = {cut:2.8, furn:true, labels:true, night:false, hour:10, mode:'orbit'};

let inited = false, active = false, raf = 0, anim = null, fly = null;
let renderer, labelRenderer, scene, camera, orbit, walkCtl, hemi, sun, ground, glassMat, wallMat, capMat, frameMat;
let archFloor, archUp, furnG, labelG, lampG, colliders = [], selKey = null, selHelper = null;
let sigArch = '', sigFurn = '', sigLabels = '', grow = 1, furnGrow = 1;
const doors = [], keys = {};

/* ======================= 初始化 ======================= */
function init(){
  if (inited) return; inited = true;
  renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(SW(), SH());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(SW(), SH());
  Object.assign(labelRenderer.domElement.style, {position:'absolute', inset:'0', pointerEvents:'none'});
  host.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, SW()/SH(), .05, 300);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI*.495; orbit.minDistance = 1.5; orbit.maxDistance = 45;
  walkCtl = new PointerLockControls(camera, document.body);
  walkCtl.addEventListener('lock', () => { $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'block'; });
  walkCtl.addEventListener('unlock', () => { if (opt.mode === 'walk'){ $('#walkOverlay').style.display = 'flex'; $('#cross').style.display = 'none'; } });

  hemi = new THREE.HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
  sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);   // 平板 GPU 用小一点的阴影贴图
  Object.assign(sun.shadow.camera, {left:-11, right:11, top:11, bottom:-11, near:1, far:60});
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color:0xf2eee7, roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.015; ground.receiveShadow = true;
  scene.add(hemi, sun, sun.target, ground);

  const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  glassMat = new THREE.MeshPhysicalMaterial({color:0xcfe6ef, roughness:.05, transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide});
  wallMat = mat('#f4f1eb', {roughness:.92}); capMat = mat('#34312d', {roughness:.9}); frameMat = mat('#5d6166', {roughness:.5, metalness:.4});
  setMatApi({ mat, rng, glassMat, frameMat });

  archFloor = new THREE.Group(); archUp = new THREE.Group(); furnG = new THREE.Group(); labelG = new THREE.Group(); lampG = new THREE.Group();
  scene.add(archFloor, archUp, furnG, labelG, lampG);

  const cv = renderer.domElement; let downAt = null, look = null;
  cv.addEventListener('pointerdown', e => {
    downAt = [e.clientX, e.clientY]; bridge.closeDrawers?.();
    if (touchWalk && !look){ look = {id:e.pointerId, x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (!look || e.pointerId !== look.id) return;
    lookBy(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
  });
  cv.addEventListener('pointercancel', e => { if (look?.id === e.pointerId) look = null; });

  // 按住已选中的家具拖动：沿地面摆放（与 2D 共用网格和贴墙吸附）。
  // 在父元素上用捕获阶段监听，赶在 OrbitControls 之前关掉它，避免同时旋转镜头
  let fdrag = null;
  host.addEventListener('pointerdown', e => {
    if (e.target !== cv || !e.isPrimary || anim || opt.mode !== 'orbit' || ui.sel?.kind !== 'furn') return;
    const h = pick(e), f = h?.fid === ui.sel.id && getF(h.fid), g = f && groundAt(e.clientX, e.clientY);
    if (!g) return;
    fdrag = {id:f.id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:g.x - f.cx, oy:g.y - f.cy, before:snap(), moved:false};
    orbit.enabled = false; fly = null; cv.setPointerCapture(e.pointerId);
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    if (!fdrag.moved && Math.hypot(e.clientX - fdrag.sx, e.clientY - fdrag.sy) < TAP) return;
    const f = getF(fdrag.id), g = groundAt(e.clientX, e.clientY); if (!f || !g) return;
    fdrag.moved = true; cv.style.cursor = 'grabbing';
    [f.cx, f.cy] = snapMove(f, g.x - fdrag.ox, g.y - fdrag.oy);
    furnG.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));   // 拖动中只挪模型，松手再整体同步
  });
  const endF = e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    const d = fdrag; fdrag = null; orbit.enabled = true; cv.style.cursor = '';
    if (d.moved){ commit(d.before); renderAll(); }
  };
  cv.addEventListener('pointerup', endF); cv.addEventListener('pointercancel', endF);

  cv.addEventListener('pointerup', e => {
    const tap = downAt && Math.hypot(e.clientX-downAt[0], e.clientY-downAt[1]) <= TAP;
    if (look?.id === e.pointerId){
      look = null;
      if (tap){ const h = pick(e); if (h?.door && h.dist < 3.5) h.door.open = !h.door.open; }   // 漫游时点门开关
      return;
    }
    if (anim || opt.mode !== 'orbit' || !tap) return;
    const h = pick(e);
    if (h?.door) h.door.open = !h.door.open;
    else if (h?.fid) bridge.select({kind:'furn', id:h.fid});
    else if (h?.room) bridge.select({kind:'room', id:h.room});
    else bridge.select(null);
  });
  new ResizeObserver(() => {
    renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH());
    camera.aspect = SW()/SH(); camera.updateProjectionMatrix();
  }).observe(stage);
  bindUI();
}

/* ======================= 材质 ======================= */
const matCache = new Map();
let envTex = null, envK = 1;
function mat(color, o = {}){
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)){
    const m = new THREE.MeshStandardMaterial({color, roughness:.7, ...o});
    // 金属 / 光滑表面挂环境反射，墙面等哑光材质不挂，避免整体变亮
    if (envTex && (m.metalness > 0 || m.roughness < .4)){ m.envMap = envTex; m.userData.env = m.metalness > .5 ? 1 : .5; m.envMapIntensity = m.userData.env*envK; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rgbK = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v*k))); return `rgb(${f(n>>16&255)},${f(n>>8&255)},${f(n&255)})`; };
// 地面贴图按真实尺寸平铺（UV 单位 = 米）
const TEX = {
  wood:{sx:1.8, sy:.36, base:'#d6b58a', rough:.55}, walnut:{sx:1.8, sy:.36, base:'#9a6f4b', rough:.5},
  tile800:{sx:.8, sy:.8, base:'#ebe6dd', grout:'#cfc6b7', rough:.3}, tile600:{sx:.6, sy:.6, base:'#dfe3e0', grout:'#bfc6c1', rough:.35},
  antislip:{sx:.3, sy:.3, base:'#d3d8d4', grout:'#aab2ac', rough:.8}, marble:{sx:1.2, sy:1.2, base:'#f2efe9', grout:'#d9d2c4', rough:.18},
  terrazzo:{sx:.5, sy:.5, base:'#e6dfd3', rough:.4}, carpet:{sx:.3, sy:.3, base:'#c6bfd2', rough:1},
};
const floorMats = {};
function floorMat(kind){
  if (floorMats[kind]) return floorMats[kind];
  const s = TEX[kind] || TEX.tile800, R = rng(kind.length*977 + 13), cv = document.createElement('canvas');
  const wood = kind === 'wood' || kind === 'walnut';
  cv.width = wood ? 1024 : 512; cv.height = wood ? 205 : 512;
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  g.fillStyle = s.base; g.fillRect(0, 0, W, Hh);
  if (wood){
    const rowH = Hh/2, joints = [[W*2/3], [W/3]];
    for (let r = 0; r < 2; r++){
      let x0 = 0;
      [...joints[r], W].forEach(x1 => {
        g.fillStyle = rgbK(s.base, .9 + R()*.2); g.fillRect(x0, r*rowH, x1-x0, rowH);
        g.strokeStyle = rgbK(s.base, .8); g.globalAlpha = .35; g.lineWidth = 1.2;
        for (let k = 0; k < 7; k++){ const y = r*rowH + 6 + R()*(rowH-12); g.beginPath(); g.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x*.02 + k)*2.5); g.stroke(); }
        g.globalAlpha = 1; g.fillStyle = rgbK(s.base, .62); g.fillRect(x1-1.5, r*rowH, 3, rowH); x0 = x1;
      });
      g.fillStyle = rgbK(s.base, .62); g.fillRect(0, r*rowH, W, 2.5);
    }
  } else if (kind === 'marble'){
    g.strokeStyle = 'rgba(160,150,135,.35)';
    for (let k = 0; k < 6; k++){ g.lineWidth = 1 + R()*3; g.beginPath(); g.moveTo(R()*W, 0); g.bezierCurveTo(R()*W, R()*Hh, R()*W, R()*Hh, R()*W, Hh); g.stroke(); }
  } else if (kind === 'terrazzo'){
    const cs = ['#b9a58c','#8fa3a0','#c9b7a2','#a88f76','#7e8a86'];
    for (let k = 0; k < 160; k++){ g.fillStyle = cs[k%5]; g.beginPath(); g.arc(R()*W, R()*Hh, 2 + R()*7, 0, 7); g.fill(); }
  } else {
    for (let k = 0; k < 1500; k++){ g.fillStyle = `rgba(0,0,0,${R()*.04})`; g.fillRect(R()*W, R()*Hh, 2, 2); }
  }
  if (s.grout){ g.fillStyle = s.grout; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, Hh); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1/s.sx, 1/s.sy);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return floorMats[kind] = new THREE.MeshStandardMaterial({map:t, roughness:s.rough});
}

/* furniture → furniture3d.js */
/* ======================= 建筑 ======================= */
function clearGroup(g){ g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }
function wallBox([x0, y0, x1, y1], yb, yt, m){
  if (yt - yb <= .001) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1-x0), yt-yb, M(y1-y0)), m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
  o.position.set(wx((x0+x1)/2), (yb+yt)/2, wz((y0+y1)/2)); o.castShadow = o.receiveShadow = true; archUp.add(o);
  // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
  const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat); ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = opt.mode === 'walk'; archUp.add(ln);
  if (yb <= .001){
    const p = o.geometry.parameters, sh = Math.min(.12, yt), sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), skirtMat);
    sk.position.set(o.position.x, sh/2, o.position.z); sk.userData.walkOnly = true; sk.visible = opt.mode === 'walk'; archUp.add(sk);
  }
}
const edgeMat = new THREE.LineBasicMaterial({color:0x6f675b}), skirtMat = new THREE.MeshStandardMaterial({color:'#8b7f6e', roughness:.6});
function shapeOf(poly, flip){ const s = new THREE.Shape(); poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y))); return s; }

function buildArch(){
  clearGroup(archFloor); clearGroup(archUp); lampG.clear(); doors.length = 0; colliders = [];
  const top = opt.cut;
  ROOMS.forEach(r => {
    const m = floorMat(state.rooms[r.id]?.mat || r.mat || 'tile800'), bay = r.counted === false;
    const geo = bay ? new THREE.ExtrudeGeometry(shapeOf(r.poly), {depth:.45, bevelEnabled:false}) : new THREE.ShapeGeometry(shapeOf(r.poly));
    geo.rotateX(-Math.PI/2);
    const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
    fl.receiveShadow = true; fl.userData.room = r.id;
    if (bay){ fl.castShadow = true; archUp.add(fl); } else archFloor.add(fl);
    // 天花：法线朝下，只在室内仰视时可见
    const cg = new THREE.ShapeGeometry(shapeOf(r.poly, true)); cg.rotateX(Math.PI/2);
    const ceil = new THREE.Mesh(cg, mat('#fbfaf7', {roughness:1})); ceil.position.y = H; ceil.visible = top >= H; archUp.add(ceil);
    if (r.at){
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .02, 32), new THREE.MeshStandardMaterial({color:'#fff', emissive:'#fff2d6', emissiveIntensity:.3}));
      lamp.position.set(wx(r.at[0]), H - .012, wz(r.at[1])); lamp.visible = top >= H; lampG.add(lamp);
      const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6); pl.position.set(wx(r.at[0]), H - .25, wz(r.at[1])); lampG.add(pl);
    }
  });
  [...DOORS, ...SLIDES].forEach(d => { const [x0, y0, x1, y1] = d.rect; const s = box(M(x1-x0), .012, M(y1-y0), mat('#d8d0c0', {roughness:.3}), wx((x0+x1)/2), 0, wz((y0+y1)/2)); s.castShadow = false; archFloor.add(s); });
  WALLS.forEach((w, i) => {
    if (state.demolished.includes(wallKey(i))) return;
    wallBox(w, 0, w[4] === 'low' ? Math.min(1, top) : top);
    colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
  });
  extraWallRects().forEach(w => {
    wallBox(w, 0, top);
    colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
  });
  // 门洞、飘窗等洞口上方过梁
  [
    ...DOORS.map(d => [d.rect, 2.1]),
    ...SLIDES.map(s => [s.rect, s.v ? 2.4 : 2.1]),
    ...LINTELS.map(l => [l.rect, l.head ?? 2.4]),
  ].forEach(([r, h]) => { if (top > h) wallBox(r, h, top); });
  WINS.forEach((r, i) => {
    const meta = WIN_META[i] || { sill: 0.9, head: 2.4 };
    const sill = meta.sill, head = meta.head;
    wallBox(r, 0, Math.min(sill, top)); if (top > head) wallBox(r, head, top);
    colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]);
    const gTop = Math.min(head, top); if (gTop <= sill) return;
    const [x0, y0, x1, y1] = r, hz = (x1-x0) >= (y1-y0), L = M(hz ? x1-x0 : y1-y0), gh = gTop - sill, cx = wx((x0+x1)/2), cz = wz((y0+y1)/2);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .01, gh, hz ? .01 : L), glassMat); pane.position.set(cx, sill + gh/2, cz); archUp.add(pane);
    const n = Math.max(1, Math.round(L/.9));
    for (let k = 0; k <= n; k++){ const t = -L/2 + k*L/n, mu = new THREE.Mesh(new THREE.BoxGeometry(hz ? .04 : .06, gh, hz ? .06 : .04), frameMat);
      mu.position.set(cx + (hz ? t : 0), sill + gh/2, cz + (hz ? 0 : t)); mu.castShadow = true; archUp.add(mu); }
    [sill + .02, gTop - .02].forEach(y => { const tr = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .06, .04, hz ? .06 : L), frameMat); tr.position.set(cx, y, cz); archUp.add(tr); });
  });
  DOORS.forEach(d => {
    const pivot = new THREE.Group(), L = M(d.len), dh = Math.min(2.05, top);
    pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
    const leaf = box(L, dh, .04, mat(d.entry ? '#6b4f3a' : '#efe6d8', {roughness:.5}), L/2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), metal()); knob.position.set(L - .07, Math.min(1, dh - .05), 0); knob.scale.z = 2.2;
    pivot.add(leaf, knob);
    const ang = v => Math.atan2(-v[1], v[0]), door = {pivot, a0:ang(d.c), a1:ang(d.o), open:true};
    if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI*2; if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI*2;
    door.cur = door.a1; pivot.rotation.y = door.cur; leaf.userData.door = knob.userData.door = door;
    doors.push(door); archUp.add(pivot);
  });
  SLIDES.forEach(({rect:[x0, y0, x1, y1], v}) => {
    const L = M(v ? y1-y0 : x1-x0), ph = Math.min(v ? 2.4 : 2.1, top), pl = L*.55;
    [[-1, -.02], [1, .02]].forEach(([s, off]) => {
      const c = s < 0 ? -L/2 + pl/2 : L/2 - pl/2, x = v ? wx((x0+x1)/2) + off : wx(x0) + L/2 + c, z = v ? wz(y0) + L/2 + c : wz((y0+y1)/2) + off;
      const p = new THREE.Mesh(new THREE.BoxGeometry(v ? .02 : pl, ph, v ? pl : .02), glassMat); p.position.set(x, ph/2, z); archUp.add(p);
      [ph - .03, .03].forEach(y => { const fr = new THREE.Mesh(new THREE.BoxGeometry(v ? .04 : pl, .05, v ? pl : .04), frameMat); fr.position.set(x, y, z); archUp.add(fr); });
      [-1, 1].forEach(e => { const fr = new THREE.Mesh(new THREE.BoxGeometry(.04, ph, .04), frameMat); fr.position.set(v ? x : x + e*pl/2, ph/2, v ? z + e*pl/2 : z); archUp.add(fr); });
    });
  });
  applyLight(); applyGrow();
}

function buildFurn(){
  clearGroup(furnG);
  state.furniture.forEach(f => {
    const g = buildFurniture(f);
    g.position.set(wx(f.cx), 0, wz(f.cy));
    g.rotation.y = -f.rot * Math.PI / 180;   // 平面顺时针旋转 → 绕 Y 轴负向
    g.userData.fid = f.id;
    furnG.add(g);
  });
  furnG.visible = opt.furn; selKey = null; applyGrow();
}

function buildLabels(){
  labelG.children.slice().forEach(o => { o.element.remove(); labelG.remove(o); });
  ROOMS.filter(r => r.at).forEach(r => {
    const el = document.createElement('div'); el.className = 'rlabel';
    el.innerHTML = `${esc(nm(state.rooms[r.id]?.name || r.name))}<small>${area(r.poly).toFixed(1)}m²</small>`;
    const o = new CSS2DObject(el); o.position.set(wx(r.at[0]), opt.cut + .15, wz(r.at[1])); o.visible = labelG.visible; labelG.add(o);
  });
  // 房间列表由 FurnitureLibrary.vue 渲染
}

// 只重建变化的部分
function sync(force){
  if (!inited || (!active && !force)) return;
  const a = JSON.stringify([state.rooms, state.demolished, state.extraWalls, opt.cut]), f = JSON.stringify(state.furniture), l = JSON.stringify([state.rooms, opt.cut]);
  if (force || a !== sigArch){ sigArch = a; buildArch(); }
  if (force || f !== sigFurn){ sigFurn = f; buildFurn(); }
  if (force || l !== sigLabels){ sigLabels = l; buildLabels(); }
}

// CSS2DRenderer 只看标签自身的 visible，不继承父级，所以逐个设置
function showLabels(v){ labelG.visible = v; labelG.children.forEach(o => o.visible = v); }
function applyGrow(){
  if (!inited) return;
  archUp.scale.y = Math.max(grow, .001);
  furnG.scale.y = Math.max(furnGrow, .001);
  lampG.visible = grow > .99;
}

/* ======================= 日照 / 夜景 ======================= */
function applyLight(){
  const t = (opt.hour - 6) / 12, az = Math.PI * (.15 + t*.7), el = Math.sin(Math.PI*t) * 1.05 + .15, warm = 1 - Math.sin(Math.PI*t);
  sun.position.set(Math.cos(az)*18, Math.sin(el)*20 + 3, -Math.sin(az)*10 + 8); sun.target.position.set(0, 0, 0);
  sun.color.setHSL(.09, .5 + warm*.4, .92 - warm*.12);
  sun.intensity = opt.night ? .05 : 1.4 + Math.sin(Math.PI*t)*1.6;
  hemi.intensity = opt.night ? .12 : 1.1;
  scene.background = new THREE.Color(opt.night ? 0x1c2130 : 0xf7f4ee);
  ground.material.color.set(opt.night ? 0x2a2e38 : 0xf2eee7);
  lampG.children.forEach(o => { if (o.isPointLight) o.intensity = opt.night ? 6 : 0; else o.material.emissiveIntensity = opt.night ? 2 : .3; });
  renderer.toneMappingExposure = opt.night ? 1.25 : 1.05;
  envK = opt.night ? .15 : 1; matCache.forEach(m => { if (m.envMap) m.envMapIntensity = m.userData.env*envK; });
  const h = Math.floor(opt.hour), m = Math.round((opt.hour - h)*60);
  $('#sunT').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/* ======================= 相机位姿 / 动画 ======================= */
const ease = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2)**3/2;
const clamp01 = t => Math.max(0, Math.min(1, t));
const pose = (t, p) => ({t, p});
// 与当前 2D 视口完全重合的正俯视位姿：透视相机在该高度下，地面可视高度 = 2D 视口高度
function planPose(){
  const cx = view.x0 + SW()/2/view.s, cy = view.y0 + SH()/2/view.s, visH = SH()/view.s/1000;
  const dist = visH / 2 / Math.tan(FOV/2*Math.PI/180), t = new THREE.Vector3(wx(cx), 0, wz(cy));
  return pose(t, new THREE.Vector3(t.x, dist, t.z + 1e-4));
}
function isoFrom(P){
  const d = THREE.MathUtils.clamp(P.p.y, 5, 30), dir = new THREE.Vector3(.3, .82, .49).normalize();
  return pose(P.t.clone(), P.t.clone().addScaledVector(dir, d));
}
const isoWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5.5, 15.5, 10));
const topWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 19, 1e-4));
const curPose = () => pose(orbit.target.clone(), camera.position.clone());
// 以目标点为中心做球坐标插值：镜头沿弧线倾斜环绕，而不是直线穿越
function camTween(A, B, e){
  const t = A.t.clone().lerp(B.t, e);
  const sa = new THREE.Spherical().setFromVector3(A.p.clone().sub(A.t)), sb = new THREE.Spherical().setFromVector3(B.p.clone().sub(B.t));
  let dth = sb.theta - sa.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius)*e, sa.phi + (sb.phi - sa.phi)*e, sa.theta + dth*e);
  camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s)); camera.lookAt(t); orbit.target.copy(t);
}
function setPose(P){ camera.position.copy(P.p); orbit.target.copy(P.t); camera.lookAt(P.t); }
function animate(dur, fn){ return new Promise(res => { anim = {t0:performance.now(), dur, fn, res}; }); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function flyTo(B, dur = 900){ fly = {t0:performance.now(), dur, A:curPose(), B}; }
function flyToRoom(id){
  const r = ROOMS.find(r => r.id === id), xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
  const t = new THREE.Vector3(wx((Math.min(...xs)+Math.max(...xs))/2), .6, wz((Math.min(...ys)+Math.max(...ys))/2));
  const size = M(Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)));
  const dir = camera.position.clone().sub(orbit.target).setY(0); if (dir.lengthSq() < .01) dir.set(.6, 0, .8); dir.normalize();
  const dist = size*1.3 + 2.2;
  flyTo(pose(t, new THREE.Vector3(t.x + dir.x*dist*.7, dist*1.05, t.z + dir.z*dist*.7)));
}

/* ======================= 进入 / 退出 3D ======================= */
async function enter(){
  init(); active = true;
  renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH()); camera.aspect = SW()/SH(); camera.updateProjectionMatrix();
  sync(true);
  opt.mode = 'orbit'; orbit.enabled = false; showLabels(false);
  const A = planPose(), B = isoFrom(A);
  grow = 0; furnGrow = 0; applyGrow(); setPose(A);
  stage.classList.add('animating');
  startLoop(); renderer.render(scene, camera);
  stage.classList.add('is3d');                       // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
  await wait(420);
  await animate(1700, t => {
    camTween(A, B, ease(clamp01(t/.85)));
    grow = ease(clamp01((t - .1)/.55));
    furnGrow = ease(clamp01((t - .45)/.5));
    applyGrow();
  });
  orbit.enabled = true; showLabels(opt.labels);
  stage.classList.remove('animating');
}
async function exit(){
  if (opt.mode === 'walk'){ walkCtl.unlock(); stopTouchWalk(); $('#hint3d').textContent = HINT_ORBIT; $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); orbit.target.copy(camera.position).addScaledVector(dir, 3).setY(0); opt.mode = 'orbit'; syncModeBtns(); }
  fly = null; orbit.enabled = false; showLabels(false); stage.classList.add('animating');
  const A = curPose(), B = planPose();
  await animate(1300, t => {
    camTween(A, B, ease(clamp01((t - .1)/.9)));
    furnGrow = 1 - ease(clamp01(t/.45));
    grow = 1 - ease(clamp01((t - .2)/.6));
    applyGrow();
  });
  stage.classList.remove('is3d');                    // 此刻 3D 已压平为正俯视，与 2D 重合后淡出
  await wait(450);
  active = false; cancelAnimationFrame(raf); raf = 0;
  stage.classList.remove('animating');
  grow = furnGrow = 1; applyGrow();
}

/* ======================= 选择 / 拾取 ======================= */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(e){
  if (!e) ptr.set(0, 0);
  else { const r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1); }
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects([...(opt.furn ? [furnG] : []), archUp, archFloor], true);
  for (const h of hits){
    let o = h.object;
    if (o.material === glassMat) continue;
    if (o.userData.door) return {door:o.userData.door, dist:h.distance};
    if (o.userData.room) return {room:o.userData.room};
    while (o && !o.userData.fid && o !== scene) o = o.parent;
    if (o?.userData.fid) return {fid:o.userData.fid};
    return null;                                     // 被墙体挡住
  }
  return null;
}
// 屏幕点 → 地面（y = 0）上的户型坐标 mm；s = 该处每 mm 对应的屏幕像素，用于拖放时的幽灵图大小
const ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y){
  if (!active || anim) return null;
  const r = renderer.domElement.getBoundingClientRect(), hit = new THREE.Vector3();
  ptr.set((x - r.left)/r.width*2 - 1, -(y - r.top)/r.height*2 + 1);
  ray.setFromCamera(ptr, camera);
  if (!ray.ray.intersectPlane(ground0, hit) || hit.distanceTo(camera.position) > 60) return null;
  // 视线先碰到墙体（或飘窗台）时，落点取碰到的位置，而不是穿过墙落到看不见的墙后
  const wall = ray.intersectObjects([archUp, archFloor], true).find(h => h.object.material !== glassMat && h.object.visible);
  if (wall && wall.distance < hit.distanceTo(camera.position) - .01) hit.set(wall.point.x, 0, wall.point.z);
  const px = v => new THREE.Vector2(v.x*r.width/2, v.y*r.height/2), a = px(hit.clone().project(camera));
  const s = Math.max(a.distanceTo(px(hit.clone().add(new THREE.Vector3(1, 0, 0)).project(camera))),
                     a.distanceTo(px(hit.clone().add(new THREE.Vector3(0, 0, 1)).project(camera)))) / 1000;
  return {x:hit.x*1000 + OX, y:hit.z*1000 + OY, s};
}
function updateSel(){
  const key = ui.sel?.kind === 'furn' ? ui.sel.id : '';
  if (key !== selKey){
    selKey = key;
    if (selHelper){ scene.remove(selHelper); selHelper.geometry.dispose(); selHelper = null; }
    const g = key && furnG.children.find(g => g.userData.fid === key);
    if (g){ selHelper = new THREE.BoxHelper(g, 0xb5653a); scene.add(selHelper); }
  }
  if (selHelper) selHelper.update();
}

/* ======================= 漫游 ======================= */
// 触屏漫游：左下虚拟摇杆移动，在画面上拖动转向（iPad 不支持鼠标指针锁定）
const HINT_ORBIT = () => COARSE ? tr('单指旋转 · 双指缩放 / 平移 · 点选家具后可拖动摆放 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · select furniture to drag it · tap doors to open')
  : tr('左键旋转 · 右键平移 · 滚轮缩放 · 选中家具后拖动可摆放 · 点击门开关', 'Left-drag orbits · right-drag pans · scroll zooms · select furniture to drag it · click doors to open');
const HINT_TOUCHWALK = () => tr('左下摇杆移动 · 拖动画面转向 · 点门开关', 'Joystick moves · drag to look · tap doors to open');
const HINT_WALK = () => tr('WASD 移动 · 鼠标转向 · Shift 快走 · E 开关门 · Esc 暂停', 'WASD moves · mouse looks · Shift runs · E opens doors · Esc pauses');
function syncHint3d(){ $('#hint3d').textContent = opt.mode === 'orbit' ? HINT_ORBIT() : touchWalk ? HINT_TOUCHWALK() : HINT_WALK(); }
let touchWalk = false;
const joy = {x:0, y:0, id:null}, eul = new THREE.Euler(0, 0, 0, 'YXZ');
function lookBy(dx, dy){
  eul.setFromQuaternion(camera.quaternion);
  eul.y += dx * .005; eul.x = THREE.MathUtils.clamp(eul.x + dy * .005, -1.35, 1.35);
  camera.quaternion.setFromEuler(eul);
}
function startTouchWalk(){
  touchWalk = true;
  $('#walkOverlay').style.display = 'none'; $('#joy').style.display = 'block'; $('#walkExit').style.display = 'block';
  syncHint3d();
}
function stopTouchWalk(){
  touchWalk = false; joy.x = joy.y = 0; joy.id = null; $('#joy i').style.transform = '';
  $('#joy').style.display = 'none'; $('#walkExit').style.display = 'none';
}
function bindJoystick(){
  const el = $('#joy'), knob = $('#joy i'), R = 50;
  const upd = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    const L = Math.hypot(dx, dy); if (L > R){ dx *= R/L; dy *= R/L; }
    joy.x = dx/R; joy.y = dy/R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function setMode(m){
  if (anim) return;
  opt.mode = m; syncModeBtns();
  if (m === 'walk'){
    bridge.select(null);
    if (opt.cut < H){ opt.cut = H; syncCutBtns(); sync(); }
    orbit.enabled = false; fly = null;
    camera.position.set(wx(WALK_START.pos[0]), 1.6, wz(WALK_START.pos[1]));
    camera.lookAt(wx(WALK_START.look[0]), 1.5, wz(WALK_START.look[1]));   // 入户门外
    $('#walkOverlay').style.display = 'flex';
    syncHint3d();
  } else {
    walkCtl.unlock(); stopTouchWalk(); orbit.enabled = true;
    $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    syncHint3d();
    orbit.target.set(0, 0, 0); flyTo(isoWhole());
  }
  showLabels(opt.labels && m === 'orbit');
  archUp.traverse(o => { if (o.userData.walkOnly) o.visible = m === 'walk'; });
}
function blocked(x, z, r = .22){
  for (const [x0, z0, x1, z1] of colliders) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
  for (const d of doors){
    const a = d.pivot.rotation.y, px = d.pivot.position.x, pz = d.pivot.position.z, ex = px + Math.cos(a)*.9, ez = pz - Math.sin(a)*.9;
    const t = clamp01(((x-px)*(ex-px) + (z-pz)*(ez-pz)) / ((ex-px)**2 + (ez-pz)**2));
    if (Math.hypot(x - (px + t*(ex-px)), z - (pz + t*(ez-pz))) < r*.8) return true;
  }
  return false;
}
function stepWalk(dt){
  if (!walkCtl.isLocked && !touchWalk) return;
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt, fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(fwd); if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
  if (keys.KeyD || keys.ArrowRight) mv.add(right); if (keys.KeyA || keys.ArrowLeft) mv.sub(right);
  if (touchWalk){ mv.addScaledVector(fwd, -joy.y).addScaledVector(right, joy.x); }
  const mag = Math.min(1, mv.length());        // 摇杆推得越远走得越快
  if (mag < .05) return;
  mv.normalize().multiplyScalar(sp * mag);
  const p = camera.position;
  if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
  if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
}
addEventListener('keydown', e => {
  if (!active || e.target.matches('input,select,textarea')) return;
  keys[e.code] = true;
  if (opt.mode === 'walk' && e.code === 'KeyE'){ const h = pick(); if (h?.door && h.dist < 2.5) h.door.open = !h.door.open; }
});
addEventListener('keyup', e => keys[e.code] = false);

/* ======================= 工具栏 ======================= */
function syncModeBtns(){ document.querySelectorAll('#modes3d .btn').forEach(b => b.classList.toggle('on', b.dataset.mode === opt.mode)); }
function syncCutBtns(){ document.querySelectorAll('[data-cut]').forEach(b => b.classList.toggle('on', +b.dataset.cut === opt.cut)); }
function syncWalkTexts(){
  const t = COARSE
    ? [tr('点击开始，从入户门进入', 'Tap to start at the front door'), tr('左下摇杆移动 · 在画面上拖动转向', 'Joystick moves · drag on screen to look'),
       tr('点门开关 · 点「退出漫游」回到鸟瞰', 'Tap doors to open · "Exit walk" returns to orbit')]
    : [tr('点击开始，从入户门进入', 'Click to start at the front door'),
       tr('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 移动 · 鼠标转向 · <kbd>Shift</kbd> 快走', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · mouse looks · <kbd>Shift</kbd> runs'),
       tr('<kbd>E</kbd> 开关正前方的门 · <kbd>Esc</kbd> 暂停', '<kbd>E</kbd> opens the door ahead · <kbd>Esc</kbd> pauses')];
  t.forEach((h, i) => $('#wo' + (i + 1)).innerHTML = h);
  syncHint3d();
}
function bindUI(){
  document.querySelectorAll('#modes3d .btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  // 触屏设备用摇杆漫游；桌面端锁定鼠标，锁定失败时也退回到摇杆
  $('#walkOverlay').onclick = () => COARSE ? startTouchWalk() : walkCtl.lock();
  document.addEventListener('pointerlockerror', () => { if (active && opt.mode === 'walk') startTouchWalk(); });
  $('#walkExit').onclick = () => setMode('orbit');
  bindJoystick();
  syncWalkTexts();
  $('#vIso').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); else flyTo(isoWhole()); };
  $('#vTop').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); flyTo(topWhole()); };
  document.querySelectorAll('[data-cut]').forEach(b => b.onclick = () => { if (opt.mode === 'walk') return; opt.cut = +b.dataset.cut; syncCutBtns(); sync(); });
  document.querySelectorAll('#toggles3d .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.t; opt[k] = !opt[k]; b.classList.toggle('on', opt[k]);
    if (k === 'furn'){ furnG.visible = opt.furn; if (!opt.furn && ui.sel?.kind === 'furn') bridge.select(null); }
    if (k === 'labels') showLabels(opt.labels && opt.mode === 'orbit' && !anim);
    if (k === 'night') applyLight();
  });
  $('#sun').oninput = e => { opt.hour = +e.target.value; applyLight(); };
}

/* ======================= 主循环 ======================= */
const clock = new THREE.Clock();
function startLoop(){ if (!raf){ clock.getDelta(); raf = requestAnimationFrame(loop); } }
function loop(){
  raf = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (anim){ const t = clamp01((now - anim.t0)/anim.dur); anim.fn(t); if (t >= 1){ const r = anim.res; anim = null; r(); } }
  else if (fly){ const t = clamp01((now - fly.t0)/fly.dur); camTween(fly.A, fly.B, ease(t)); if (t >= 1) fly = null; }
  else if (opt.mode === 'orbit') orbit.update();
  else stepWalk(dt);
  doors.forEach(d => { const tg = d.open ? d.a1 : d.a0; d.cur += (tg - d.cur) * Math.min(1, dt*6); d.pivot.rotation.y = d.cur; });
  updateSel();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function shot(){ const a = document.createElement('a'); a.download = tr('户型装修方案', 'floor-plan-design') + '-3D.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); }

function relang(){ syncWalkTexts(); if (inited) buildLabels(); }

function onPlanChange(){
  OX = CENTER.x;
  OY = CENTER.y;
  sigArch = sigFurn = sigLabels = '';
  if (opt.mode === 'walk') setMode('orbit');
  if (inited) sync(true);
  if (active && !anim) flyTo(isoWhole());
}

bridge.View3D = window.View3D = {
  enter, exit, relang, sync: () => sync(), shot, groundAt,
  flyToRoom: id => active && !anim && flyToRoom(id),
  flyToWhole: () => active && !anim && flyTo(isoWhole()),
  setMode,
  walking: () => active && opt.mode === 'walk',
  onPlanChange,
};

