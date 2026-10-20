<script setup>
import { computed } from 'vue';
import { ROOMS } from '../data/floorplan.js';
import { state, ui, revision, langTick, select, getF } from '../store/design.js';
import { tr, nm } from '../i18n.js';
import { bridge } from '../engine/bridge.js';

const active = computed(() => {
  revision.value;
  langTick.value;
  const sel = ui.sel;
  if (sel?.kind === 'furn') {
    const f = getF(sel.id);
    return f ? { kind: 'furn', f, name: nm(f.name) } : null;
  }
  if (sel?.kind === 'room') {
    const r = ROOMS.find(x => x.id === sel.id);
    if (!r) return null;
    const name = nm(state.rooms[r.id]?.name || r.name);
    return { kind: 'room', r, name };
  }
  return null;
});

function rotate(d) {
  bridge.api?.rotateSel?.(d);
}
function dup() {
  bridge.api?.duplicateSel?.();
}
function del() {
  bridge.api?.deleteSel?.();
}
function openProps() {
  bridge.api?.drawer?.('panel', true);
}
function done() {
  select(null);
  bridge.closeDrawers?.();
}
</script>

<template>
  <div id="fab" :class="{ show: !!active }">
    <template v-if="active?.kind === 'furn'">
      <span class="name">{{ active.name }}</span>
      <button class="btn" type="button" @click="rotate(-90)">↺</button>
      <button class="btn" type="button" @click="rotate(90)">↻ {{ tr('旋转', 'Rotate') }}</button>
      <button class="btn" type="button" @click="dup">{{ tr('复制', 'Duplicate') }}</button>
      <button class="btn danger" type="button" @click="del">{{ tr('删除', 'Delete') }}</button>
      <span class="sep" />
      <button class="btn narrow-only" type="button" @click="openProps">{{ tr('属性', 'Properties') }}</button>
      <button class="btn" type="button" @click="done">{{ tr('完成', 'Done') }}</button>
    </template>
    <template v-else-if="active?.kind === 'room'">
      <span class="name">{{ active.name }}</span>
      <button class="btn narrow-only" type="button" @click="openProps">{{ tr('地面 / 属性', 'Floor / Properties') }}</button>
      <button class="btn" type="button" @click="done">{{ tr('完成', 'Done') }}</button>
    </template>
  </div>
</template>
