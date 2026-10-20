<script setup>
import { toastState } from '../store/design.js';
</script>

<template>
  <div id="toast" :class="{ show: toastState.show }">{{ toastState.message }}</div>
</template>
