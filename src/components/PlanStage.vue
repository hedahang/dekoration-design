<script setup>
import FabBar from './FabBar.vue';
</script>

<template>
  <main id="stage">
    <svg id="plan" class="tool-select" font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
      <defs id="defs"></defs>
      <g id="gGrid"></g>
      <g id="gRooms"></g>
      <g id="gFurn"></g>
      <g id="gWalls"></g>
      <g id="gOpen"></g>
      <g id="gLabels" pointer-events="none"></g>
      <g id="gDims" pointer-events="none"></g>
      <g id="gMeasure" pointer-events="none"></g>
      <g id="gSel"></g>
    </svg>
    <div id="view3d">
      <div id="walkOverlay"><div><h3 data-en="Walk mode">漫游模式</h3>
        <p id="wo1"></p>
        <p id="wo2"></p>
        <p id="wo3"></p></div></div>
      <div id="cross"></div>
      <div id="joy"><i></i></div>
      <button class="btn primary" id="walkExit" data-en="Exit walk">退出漫游</button>
      <div id="hint3d"></div>
    </div>
    <div class="scalebar" id="scalebar"><span id="sbText">1 m</span><div class="bar" id="sbBar"></div></div>
    <div class="modehint" id="modehint"></div>
    <FabBar />
  </main>
</template>
