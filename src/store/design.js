import { reactive, ref, shallowRef } from 'vue';
import { load, defaultState, persistState, getActivePlanId, isEditablePlan, applyGeometry } from '../data/floorplan.js';
import { tr, onLangChange } from '../i18n.js';

/* ======================= 响应式状态（Vue 拥有 UI 可读状态） ======================= */

function blankUi() {
  return {
    tool: 'select',
    sel: null,
    mA: null,
    mCur: null,
    layers: { dims: true, labels: true, furn: true, grid: false, bearing: false, wallSnap: true },
  };
}

const initial = load() || defaultState();
if (isEditablePlan() && initial.geometry) applyGeometry(initial.geometry);

/** 方案数据：保持单一 reactive 对象，undo/redo 时原地替换字段 */
export const state = reactive(initial);

export const ui = reactive(blankUi());

export const view = reactive({ x0: 0, y0: 0, s: 0.06 });

/** 几何 / 户型切换等引擎侧变更时递增，供 Vue 重算 ROOMS 派生 UI */
export const revision = ref(0);

/** 语言切换时递增（与 i18n.LANG 同步） */
export const langTick = ref(0);

/** Toast */
export const toastState = reactive({ message: '', show: false });
let _toastTimer = 0;

/** 侧栏收起（宽屏记住；窄屏用 openLib / openPanel） */
const PANES_KEY = 'huxing-panes';
function readPanes() {
  try { return JSON.parse(localStorage.getItem(PANES_KEY)) || {}; } catch (e) { return {}; }
}
export const panes = reactive({
  hideLib: !!readPanes().hideLib,
  hidePanel: !!readPanes().hidePanel,
  openLib: false,
  openPanel: false,
});

export function bumpRevision() {
  revision.value++;
}

export function bumpLang() {
  langTick.value++;
}
onLangChange(() => bumpLang());

export function toast(msg) {
  toastState.message = msg;
  toastState.show = true;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastState.show = false; }, 1800);
}

export function persistPanes() {
  try {
    localStorage.setItem(PANES_KEY, JSON.stringify({
      hideLib: panes.hideLib,
      hidePanel: panes.hidePanel,
    }));
  } catch (e) { /* ignore */ }
}

/** 把 plain 对象字段写入 reactive state（保留同一引用） */
export function applyStateData(next) {
  const keys = new Set([...Object.keys(state), ...Object.keys(next)]);
  for (const k of keys) {
    if (!(k in next)) delete state[k];
    else state[k] = next[k];
  }
}

export const undoStack = [];
export const redoStack = [];

/** 画布刷新钩子（由 plan2d 注册；不含面板 DOM） */
const hooks = shallowRef({ renderCanvas: () => {} });

export function setStoreHooks({ renderCanvas, renderAll, toast: toastHook } = {}) {
  // renderAll 兼容旧名 → 仅画布
  const fn = renderCanvas || renderAll;
  if (fn) hooks.value = { renderCanvas: fn };
  if (toastHook) {
    // 允许引擎仍调用旧 toast 钩子时落到响应式 toast
  }
}

function renderCanvas() {
  hooks.value.renderCanvas();
}

function syncRuntimeFromState() {
  if (isEditablePlan() && state.geometry) applyGeometry(state.geometry);
}

export function save() {
  persistState(state);
}

export const snap = () => JSON.stringify(state);

export function commit(before) {
  undoStack.push(before);
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  save();
}

export function mutate(fn) {
  const b = snap();
  fn();
  commit(b);
  bumpRevision();
  renderCanvas();
}

export function undo() {
  if (!undoStack.length) return toast(tr('没有可撤销的操作', 'Nothing to undo'));
  redoStack.push(snap());
  applyStateData(JSON.parse(undoStack.pop()));
  syncRuntimeFromState();
  validateSel();
  save();
  bumpRevision();
  renderCanvas();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  applyStateData(JSON.parse(redoStack.pop()));
  syncRuntimeFromState();
  validateSel();
  save();
  bumpRevision();
  renderCanvas();
}

export function validateSel() {
  if (ui.sel?.kind === 'furn' && !getF(ui.sel.id)) ui.sel = null;
  if (ui.sel?.kind === 'room' && !state.rooms[ui.sel.id]) ui.sel = null;
}

export const getF = id => state.furniture.find(f => f.id === id);

export function replaceState(next) {
  applyStateData(next);
  syncRuntimeFromState();
  validateSel();
  save();
  bumpRevision();
  renderCanvas();
}

/** 切换户型后清空撤销栈并换上新 state（不进入撤销历史） */
export function bootstrapState(next) {
  applyStateData(next);
  undoStack.length = 0;
  redoStack.length = 0;
  ui.sel = null;
  ui.mA = null;
  ui.mCur = null;
  syncRuntimeFromState();
  validateSel();
  save();
  bumpRevision();
}

/** 选择：只改 ui，画布选区由引擎钩子刷新；面板由 Vue 响应 ui.sel */
let _onSelect = null;
export function setSelectHook(fn) {
  _onSelect = fn;
}

export function select(sel) {
  ui.sel = sel;
  _onSelect?.(sel);
}

export { getActivePlanId };
