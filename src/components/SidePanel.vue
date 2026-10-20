<script setup>
import { computed } from 'vue';
import { ROOMS, MATS, COARSE, isEditablePlan, wallById } from '../data/floorplan.js';
import {
  state, ui, revision, langTick, mutate, select, getF,
} from '../store/design.js';
import { tr, nm } from '../i18n.js';
import { area, perim, bbox, fmt, wallLengthMm, norm } from '../utils/geometry.js';
import { bridge } from '../engine/bridge.js';

const tick = computed(() => {
  revision.value;
  langTick.value;
  return revision.value + langTick.value;
});

const mode = computed(() => {
  tick.value;
  if (ui.sel?.kind === 'furn' && getF(ui.sel.id)) return 'furn';
  if (ui.sel?.kind === 'room' && ROOMS.some(r => r.id === ui.sel.id)) return 'room';
  return 'overview';
});

const furn = computed(() => {
  tick.value;
  return ui.sel?.kind === 'furn' ? getF(ui.sel.id) : null;
});

const room = computed(() => {
  tick.value;
  return ui.sel?.kind === 'room' ? ROOMS.find(r => r.id === ui.sel.id) : null;
});

/* —— 总览 —— */
const overview = computed(() => {
  tick.value;
  const roomRows = ROOMS.map(r => {
    const st = state.rooms[r.id] || { name: r.name, mat: r.mat || 'tile800' };
    return {
      id: r.id,
      name: nm(st.name),
      matSw: MATS[st.mat]?.sw || '#ccc',
      area: fmt(area(r.poly)),
      counted: r.counted !== false,
    };
  });
  const tot = ROOMS.filter(r => r.counted !== false).reduce((a, r) => a + area(r.poly), 0);
  const byMat = {};
  ROOMS.forEach(r => {
    const m = state.rooms[r.id]?.mat || r.mat || 'tile800';
    byMat[m] = (byMat[m] || 0) + area(r.poly);
  });
  let cost = 0;
  const matRows = Object.entries(byMat).map(([m, a]) => {
    const c = a * MATS[m].price * 1.05;
    cost += c;
    return { name: nm(MATS[m].name), sw: MATS[m].sw, area: fmt(a, 1), cost: Math.round(c) };
  });
  const dem = state.demolished.map(id => wallById(id)).filter(Boolean);
  const demLen = dem.reduce((a, w) => a + wallLengthMm(w), 0) / 1000;
  const extraN = (state.extraWalls || []).length;
  const extraLen = (state.extraWalls || []).reduce((a, w) => a + wallLengthMm(w), 0) / 1000;
  return {
    roomRows,
    tot: fmt(tot),
    matRows,
    cost: Math.round(cost),
    furnCount: state.furniture.length,
    demLen: fmt(demLen, 1),
    extraN,
    extraLen: fmt(extraLen, 1),
    measureN: state.measures.length,
  };
});

function pickRoom(id) {
  select({ kind: 'room', id });
  if (document.body.classList.contains('m3d')) bridge.View3D?.flyToRoom?.(id);
}

function clearMeasures() {
  if (!state.measures.length) return;
  mutate(() => { state.measures = []; });
}

function clearExtraWalls() {
  if (!(state.extraWalls || []).length) return;
  if (!confirm(tr('清除所有自建墙？（可撤销）', 'Clear all custom walls? (undoable)'))) return;
  mutate(() => { state.extraWalls = []; });
}

function clearLayout() {
  bridge.api?.clearLayout?.();
}

/* —— 房间 —— */
const roomView = computed(() => {
  tick.value;
  const r = room.value;
  if (!r) return null;
  const st = state.rooms[r.id] || { name: r.name, mat: r.mat || 'tile800' };
  const a = area(r.poly);
  const [x0, y0, x1, y1] = bbox(r.poly);
  const inside = state.furniture.filter(f => f.cx > x0 && f.cx < x1 && f.cy > y0 && f.cy < y1);
  return {
    id: r.id,
    name: st.name,
    displayName: nm(st.name),
    mat: st.mat,
    area: fmt(a),
    perim: fmt(perim(r.poly), 1),
    width: x1 - x0,
    depth: y1 - y0,
    wallArea: fmt(perim(r.poly) * 2.8, 1),
    cost: Math.round(a * (MATS[st.mat]?.price || 0) * 1.05),
    inside,
    mats: Object.entries(MATS).map(([k, m]) => ({
      id: k, name: nm(m.name), price: m.price, sw: m.sw, on: k === st.mat,
    })),
  };
});

function ensureRoom(id) {
  if (!state.rooms[id]) {
    const r = ROOMS.find(x => x.id === id);
    state.rooms[id] = { name: r?.name || id, mat: r?.mat || 'tile800' };
  }
}

function syncGeoRoom(id) {
  if (!isEditablePlan() || !state.geometry?.rooms) return;
  const gr = state.geometry.rooms.find(x => x.id === id);
  if (gr) {
    gr.name = state.rooms[id].name;
    gr.mat = state.rooms[id].mat;
  }
}

function onRoomName(e) {
  const id = ui.sel?.id;
  if (!id) return;
  mutate(() => {
    ensureRoom(id);
    state.rooms[id].name = e.target.value.trim() || state.rooms[id].name;
    syncGeoRoom(id);
  });
}

function setMat(mat) {
  const id = ui.sel?.id;
  if (!id) return;
  mutate(() => {
    ensureRoom(id);
    state.rooms[id].mat = mat;
    syncGeoRoom(id);
  });
}

/* —— 家具 —— */
function updFurn(fn) {
  const id = ui.sel?.id;
  if (!id) return;
  mutate(() => {
    const g = getF(id);
    if (g) fn(g);
  });
}

function onFurnField(field, raw) {
  updFurn(g => {
    if (field === 'name') g.name = String(raw).trim() || g.name;
    else if (field === 'w') g.w = Math.max(50, Math.round(+raw));
    else if (field === 'd') g.d = Math.max(50, Math.round(+raw));
    else if (field === 'cx') g.cx = +raw;
    else if (field === 'cy') g.cy = +raw;
    else if (field === 'rot') g.rot = norm(+raw);
    else if (field === 'color') g.color = raw;
  });
}

function bringFront() {
  const id = ui.sel?.id;
  if (!id) return;
  mutate(() => {
    const i = state.furniture.findIndex(g => g.id === id);
    if (i >= 0) state.furniture.push(...state.furniture.splice(i, 1));
  });
}

function sendBack() {
  const id = ui.sel?.id;
  if (!id) return;
  mutate(() => {
    const i = state.furniture.findIndex(g => g.id === id);
    if (i >= 0) state.furniture.unshift(...state.furniture.splice(i, 1));
  });
}
</script>

<template>
  <aside class="right">
    <div id="panel">
      <!-- 总览 -->
      <template v-if="mode === 'overview'">
        <section>
          <h3>{{ tr('房间面积', 'Room Areas') }} <small>{{ tr('点击查看 / 更换地面', 'Click to view / change flooring') }}</small></h3>
          <table>
            <tr
              v-for="r in overview.roomRows"
              :key="r.id"
              class="click"
              @click="pickRoom(r.id)"
            >
              <td>
                <span class="sw" :style="{ background: r.matSw }" />{{ r.name }}
                <span v-if="!r.counted" class="muted"> *</span>
              </td>
              <td class="r">{{ r.area }} m²</td>
            </tr>
          </table>
          <div class="total">
            <span>{{ tr('套内使用面积', 'Net floor area') }}</span>
            <b>{{ overview.tot }} m²</b>
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px">
            {{ tr('* 飘窗不计入使用面积；面积按墙体内净尺寸计算', '* Bay windows are excluded; areas use net inner wall dimensions') }}
          </div>
        </section>

        <section>
          <h3>{{ tr('地面材料估算', 'Flooring Estimate') }} <small>{{ tr('含 5% 损耗', 'incl. 5% waste') }}</small></h3>
          <table>
            <tr v-for="(m, i) in overview.matRows" :key="i">
              <td><span class="sw" :style="{ background: m.sw }" />{{ m.name }}</td>
              <td class="r">{{ m.area }} m²</td>
              <td class="r">¥{{ m.cost.toLocaleString() }}</td>
            </tr>
          </table>
          <div class="total">
            <span>{{ tr('地面材料合计', 'Flooring total') }}</span>
            <b>¥{{ overview.cost.toLocaleString() }}</b>
          </div>
        </section>

        <section>
          <h3>{{ tr('方案统计', 'Plan Stats') }}</h3>
          <div class="stats">
            <div>
              <small>{{ tr('家具数量', 'Furniture') }}</small>
              <span class="big">{{ overview.furnCount }}</span>
            </div>
            <div>
              <small>{{ tr('拆除墙体', 'Walls removed') }}</small>
              <span class="big">{{ overview.demLen }}</span> m
            </div>
            <div>
              <small>{{ tr('自建墙', 'Custom walls') }}</small>
              <span class="big">{{ overview.extraN }}</span> · {{ overview.extraLen }} m
            </div>
          </div>
          <div class="actions">
            <button class="btn" type="button" @click="clearMeasures">
              {{ tr('清除测量', 'Clear measures') }} ({{ overview.measureN }})
            </button>
            <button class="btn" type="button" :disabled="!overview.extraN" @click="clearExtraWalls">
              {{ tr('清除自建墙', 'Clear custom walls') }} ({{ overview.extraN }})
            </button>
            <button class="btn danger" type="button" @click="clearLayout">
              {{ tr('清空布置', 'Clear layout') }}
            </button>
          </div>
        </section>

        <section v-if="COARSE">
          <h3>{{ tr('触屏操作', 'Touch Controls') }}</h3>
          <div class="kbd">
            <kbd>{{ tr('单指拖动', '1-finger drag') }}</kbd><span>{{ tr('空白处平移画面', 'Pan on empty space') }}</span>
            <kbd>{{ tr('双指', '2 fingers') }}</kbd><span>{{ tr('捏合缩放、拖动平移', 'Pinch to zoom, drag to pan') }}</span>
            <kbd>{{ tr('家具库', 'Library') }}</kbd><span>{{ tr('点一下放到画面中央，或按住向右拖到指定位置', 'Tap to place at the center, or hold and drag right onto the plan') }}</span>
            <kbd>{{ tr('点家具', 'Tap item') }}</kbd><span>{{ tr('选中后拖动移动；拖顶部圆点旋转、右下方块改尺寸', 'Drag to move; top dot rotates, bottom-right square resizes') }}</span>
            <kbd>{{ tr('工具条', 'Toolbar') }}</kbd><span>{{ tr('选中后底部可旋转 / 复制 / 删除', 'Bottom bar can rotate / duplicate / delete') }}</span>
            <kbd>{{ tr('测量', 'Measure') }}</kbd><span>{{ tr('按住拖出一条线，或依次点两点', 'Hold and drag a line, or tap two points') }}</span>
            <kbd>{{ tr('3D 漫游', '3D walk') }}</kbd><span>{{ tr('左下摇杆移动，拖动屏幕转向，点门开关', 'Joystick moves, drag to look, tap doors to open') }}</span>
          </div>
        </section>

        <section>
          <h3>{{ tr('键盘快捷键', 'Keyboard Shortcuts') }}</h3>
          <div class="kbd">
            <kbd>{{ tr('拖拽', 'Drag') }}</kbd><span>{{ tr('左侧家具拖入平面图', 'Drag furniture onto the plan') }}</span>
            <kbd>V</kbd><span>{{ tr('选择 / 移动', 'Select / move') }}</span>
            <kbd>M</kbd><span>{{ tr('测量（Shift 水平/垂直）', 'Measure (Shift: horizontal/vertical)') }}</span>
            <kbd>W</kbd><span>{{ tr('画墙（轴对齐 120mm）', 'Draw wall (axis-aligned 120mm)') }}</span>
            <kbd>X</kbd><span>{{ tr('拆改墙 / 删自建墙', 'Demolish / delete custom walls') }}</span>
            <kbd>R</kbd><span>{{ tr('旋转 90°', 'Rotate 90°') }}</span>
            <kbd>{{ tr('方向键', 'Arrows') }}</kbd><span>{{ tr('微调 10mm', 'Nudge 10mm') }}</span>
            <kbd>⌘/Ctrl D</kbd><span>{{ tr('复制', 'Duplicate') }}</span>
            <kbd>Delete</kbd><span>{{ tr('删除', 'Delete') }}</span>
            <kbd>⌘/Ctrl Z</kbd><span>{{ tr('撤销', 'Undo') }}</span>
            <kbd>T</kbd><span>{{ tr('切换 2D / 3D', 'Toggle 2D / 3D') }}</span>
            <kbd>F</kbd><span>{{ tr('适应窗口', 'Fit to window') }}</span>
            <kbd>Esc</kbd><span>{{ tr('取消选择', 'Deselect') }}</span>
          </div>
        </section>
      </template>

      <!-- 房间 -->
      <template v-else-if="mode === 'room' && roomView">
        <section>
          <h3>{{ tr('房间', 'Room') }}</h3>
          <div class="form">
            <label class="full">
              {{ tr('名称', 'Name') }}
              <input :value="roomView.displayName" @change="onRoomName">
            </label>
          </div>
          <div class="stats" style="margin-top:10px">
            <div><small>{{ tr('使用面积', 'Floor area') }}</small><span class="big">{{ roomView.area }}</span> m²</div>
            <div><small>{{ tr('周长', 'Perimeter') }}</small><span class="big">{{ roomView.perim }}</span> m</div>
            <div><small>{{ tr('开间', 'Width') }}</small><span class="big">{{ roomView.width }}</span> mm</div>
            <div><small>{{ tr('进深', 'Depth') }}</small><span class="big">{{ roomView.depth }}</span> mm</div>
          </div>
          <div class="muted">
            {{ tr(`墙面面积（层高 2.8m，未扣门窗）约 ${roomView.wallArea} m²`, `Wall area (2.8m ceiling, openings not deducted) ≈ ${roomView.wallArea} m²`) }}
          </div>
        </section>
        <section>
          <h3>{{ tr('地面材料', 'Flooring') }}</h3>
          <div class="mats">
            <button
              v-for="m in roomView.mats"
              :key="m.id"
              type="button"
              class="mat"
              :class="{ on: m.on }"
              @click="setMat(m.id)"
            >
              <i :style="{ background: m.sw }" /><span>{{ m.name }}<small>¥{{ m.price }}/m²</small></span>
            </button>
          </div>
          <div class="total">
            <span>{{ tr('材料估价', 'Estimated cost') }}</span>
            <b>¥{{ roomView.cost.toLocaleString() }}</b>
          </div>
        </section>
        <section>
          <h3>
            {{ tr('房间内家具', 'Furniture in room') }}
            <small>{{ tr(`${roomView.inside.length} 件`, `${roomView.inside.length} items`) }}</small>
          </h3>
          <table>
            <tr v-if="!roomView.inside.length"><td class="muted">{{ tr('暂无', 'None') }}</td></tr>
            <tr
              v-for="f in roomView.inside"
              :key="f.id"
              class="click"
              @click="select({ kind: 'furn', id: f.id })"
            >
              <td>{{ nm(f.name) }}</td>
              <td class="r muted">{{ f.w }}×{{ f.d }}</td>
            </tr>
          </table>
          <div class="actions">
            <button class="btn" type="button" @click="select(null)">{{ tr('← 返回总览', '← Back to overview') }}</button>
          </div>
        </section>
      </template>

      <!-- 家具 -->
      <template v-else-if="mode === 'furn' && furn">
        <section>
          <h3>{{ tr('家具属性', 'Furniture') }}</h3>
          <div class="form">
            <label class="full">
              {{ tr('名称', 'Name') }}
              <input :value="nm(furn.name)" @change="onFurnField('name', $event.target.value)">
            </label>
            <label>
              {{ tr('宽', 'Width') }} (mm)
              <input type="number" :value="furn.w" min="50" step="10" @change="onFurnField('w', $event.target.value)">
            </label>
            <label>
              {{ tr('深', 'Depth') }} (mm)
              <input type="number" :value="furn.d" min="50" step="10" @change="onFurnField('d', $event.target.value)">
            </label>
            <label>
              {{ tr('中心', 'Center') }} X (mm)
              <input type="number" :value="Math.round(furn.cx)" step="10" @change="onFurnField('cx', $event.target.value)">
            </label>
            <label>
              {{ tr('中心', 'Center') }} Y (mm)
              <input type="number" :value="Math.round(furn.cy)" step="10" @change="onFurnField('cy', $event.target.value)">
            </label>
            <label>
              {{ tr('旋转', 'Rotation') }} (°)
              <input type="number" :value="furn.rot" step="15" @change="onFurnField('rot', $event.target.value)">
            </label>
            <label>
              {{ tr('颜色', 'Color') }}
              <input type="color" :value="furn.color" @change="onFurnField('color', $event.target.value)">
            </label>
          </div>
          <div class="muted" style="margin-top:8px">
            {{ tr('占地面积', 'Footprint') }} {{ fmt(furn.w * furn.d / 1e6) }} m²
          </div>
          <div class="actions">
            <button class="btn" type="button" @click="bridge.api?.rotateSel?.(90)">{{ tr('旋转 90°', 'Rotate 90°') }}</button>
            <button class="btn" type="button" @click="bridge.api?.duplicateSel?.()">{{ tr('复制', 'Duplicate') }}</button>
            <button class="btn" type="button" @click="bringFront">{{ tr('置于顶层', 'Bring to front') }}</button>
            <button class="btn" type="button" @click="sendBack">{{ tr('置于底层', 'Send to back') }}</button>
            <button class="btn danger" type="button" @click="bridge.api?.deleteSel?.()">{{ tr('删除', 'Delete') }}</button>
            <button class="btn" type="button" @click="select(null)">{{ tr('← 返回', '← Back') }}</button>
          </div>
        </section>
        <section class="muted" style="font-size:12px">
          {{ tr('拖动家具移动；拖动上方圆点旋转；拖动右下角方块调整尺寸。开启「贴墙吸附」后靠近墙面会自动贴齐。', 'Drag to move; drag the top dot to rotate; drag the bottom-right square to resize. With "Wall snap" on, items snap flush to nearby walls.') }}
        </section>
      </template>
    </div>
  </aside>
</template>
