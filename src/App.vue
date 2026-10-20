<script setup>
import { onMounted, ref } from 'vue';
import AppHeader from './components/AppHeader.vue';
import FurnitureLibrary from './components/FurnitureLibrary.vue';
import PlanStage from './components/PlanStage.vue';
import SidePanel from './components/SidePanel.vue';
import AppFooter from './components/AppFooter.vue';
import Toast from './components/Toast.vue';

const error = ref('');

onMounted(async () => {
  try {
    const { initPlan2D } = await import('./engine/plan2d.js');
    await import('./engine/view3d.js');
    initPlan2D();
  } catch (e) {
    console.error(e);
    error.value = e?.message || String(e);
  }
});
</script>

<template>
  <div class="app">
    <AppHeader />
    <FurnitureLibrary />
    <PlanStage />
    <SidePanel />
    <AppFooter />
  </div>
  <Toast />
  <div v-if="error" class="boot-error">{{ error }}</div>
</template>

<style scoped>
.boot-error {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(43, 40, 36, 0.92);
  color: #fff;
  font-size: 14px;
  text-align: center;
}
</style>
