<script setup>
import { computed, ref } from 'vue';
import { LIB, ROOMS, COARSE } from '../data/floorplan.js';
import { state, revision, langTick } from '../store/design.js';
import { tr, nm } from '../i18n.js';
import { area } from '../utils/geometry.js';
import { furnSVG } from '../engine/furnitureSvg.js';
import { bridge } from '../engine/bridge.js';

const tick = computed(() => revision.value + langTick.value);
const flyId = ref('');

const cats = computed(() => {
  tick.value;
  return LIB.map((c, ci) => ({
    cat: nm(c.cat),
    items: c.items.map((it, ii) => {
      const [t, n, w, d, col] = it;
      const pad = Math.max(w, d) * 0.08;
      return {
        key: `${ci}:${ii}`,
        type: t,
        name: nm(n),
        w,
        d,
        raw: it,
        viewBox: `${-w / 2 - pad} ${-d / 2 - pad} ${w + 2 * pad} ${d + 2 * pad}`,
        svg: furnSVG(t, w, d, col),
      };
    }),
  }));
});

const rooms = computed(() => {
  tick.value;
  const counted = ROOMS.filter(r => r.counted !== false);
  const list = counted.map(r => ({
    id: r.id,
    name: nm(state.rooms[r.id]?.name || r.name),
    area: area(r.poly).toFixed(2),
  }));
  const total = counted.reduce((a, r) => a + area(r.poly), 0);
  return {
    list,
    total: total.toFixed(2),
  };
});

const hint = computed(() => {
  tick.value;
  return tr(
    `家具按真实尺寸（mm）绘制。${COARSE ? '点一下放到画面中央，或按住向右拖到平面图 / 3D 地面上的指定位置（上下滑动为滚动列表）。' : '点击添加到画面中央，或直接拖到平面图 / 3D 地面上。'}添加后可在右侧修改宽深与颜色。`,
    `Furniture is drawn at real size (mm). ${COARSE ? 'Tap to place at the center, or hold and drag right onto the plan / 3D floor (swipe up/down to scroll).' : 'Click to add at the center, or drag onto the plan / 3D floor.'} Edit size and color in the right panel afterwards.`,
  );
});

function onItemPointerDown(item, e) {
  if (e.button) return;
  bridge.api?.beginLibDrag?.(item.raw, e);
}

function flyTo(id) {
  flyId.value = id;
  if (bridge.View3D?.walking?.()) bridge.View3D.setMode?.('orbit');
  if (id === '__all') bridge.View3D?.flyToWhole?.();
  else bridge.View3D?.flyToRoom?.(id);
}
</script>

<template>
  <aside class="lib">
    <div id="lib3d" class="only3d">
      <h4>{{ tr('房间 · 点击飞到该房间', 'Rooms · click to fly there') }}</h4>
      <div id="roomList">
        <button
          v-for="r in rooms.list"
          :key="r.id"
          type="button"
          :data-room="r.id"
          :class="{ on: flyId === r.id }"
          @click="flyTo(r.id)"
        >
          <span>{{ r.name }}</span>
          <small>{{ r.area }} m²</small>
        </button>
        <button
          type="button"
          data-room="__all"
          :class="{ on: flyId === '__all' }"
          @click="flyTo('__all')"
        >
          <span>{{ tr('全屋', 'Whole home') }}</span>
          <small>{{ rooms.total }} m²</small>
        </button>
      </div>
    </div>
    <div id="lib">
      <template v-for="(c, ci) in cats" :key="ci">
        <h4>{{ c.cat }}</h4>
        <div class="lib-grid">
          <div
            v-for="it in c.items"
            :key="it.key"
            class="item"
            :data-key="it.key"
            :title="tr('点击添加，或拖到平面图中的指定位置', 'Click to add, or drag onto the plan')"
            @pointerdown="onItemPointerDown(it, $event)"
          >
            <svg :viewBox="it.viewBox" v-html="it.svg" />
            <b>{{ it.name }}</b>
            <small>{{ it.w }}×{{ it.d }}</small>
          </div>
        </div>
      </template>
      <div class="hint">{{ hint }}</div>
    </div>
  </aside>
</template>
