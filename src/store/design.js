import { load, defaultState, STORE } from '../data/floorplan.js';
import { tr } from '../i18n.js';

/* ======================= 状态 / 历史 / 存储 ======================= */
export let state = load() || defaultState();
export const ui = {
  tool: 'select', sel: null, mA: null, mCur: null,
  layers: { dims: true, labels: true, furn: true, grid: false, bearing: false, wallSnap: true },
};
export let view = { x0: 0, y0: 0, s: 0.06 };
export const undoStack = [], redoStack = [];

let _renderAll = () => {};
let _toast = () => {};
export function setStoreHooks({ renderAll, toast }) {
  if (renderAll) _renderAll = renderAll;
  if (toast) _toast = toast;
}

export function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
export const snap = () => JSON.stringify(state);
export function commit(before) {
  undoStack.push(before);
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  save();
}
export function mutate(fn) { const b = snap(); fn(); commit(b); _renderAll(); }
export function undo() {
  if (!undoStack.length) return _toast(tr('没有可撤销的操作', 'Nothing to undo'));
  redoStack.push(snap());
  state = JSON.parse(undoStack.pop());
  validateSel();
  save();
  _renderAll();
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  state = JSON.parse(redoStack.pop());
  validateSel();
  save();
  _renderAll();
}
export function validateSel() {
  if (ui.sel?.kind === 'furn' && !getF(ui.sel.id)) ui.sel = null;
}
export const getF = id => state.furniture.find(f => f.id === id);

export function replaceState(next) {
  state = next;
  validateSel();
  save();
  _renderAll();
}
