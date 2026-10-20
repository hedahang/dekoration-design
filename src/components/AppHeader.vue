<template>
  <header>
    <div class="grp" id="paneBtns">
      <button class="btn chip" id="tgLib" data-en="◧ Library">◧ 家具库</button>
      <button class="btn chip" id="tgPanel" data-en="Properties ◨">属性 ◨</button>
    </div>
    <div class="brand"><b data-en="3BR 2LR 2BA · Interior Design">三室两厅两卫 · 装修设计</b><span id="subtitle">原始户型 1:60 · 尺寸单位 mm</span></div>
    <div class="grp seg" id="viewSeg" title="切换 2D / 3D (T)" data-en-title="Switch 2D / 3D (T)">
      <span class="pill"></span>
      <button class="btn" data-view="2d" data-en="2D Plan">2D 平面</button>
      <button class="btn" data-view="3d" data-en="3D Scene">3D 场景</button>
    </div>
    <div class="grp only2d" id="tools">
      <button class="btn on" data-tool="select" title="选择 / 移动 (V)" data-en-title="Select / Move (V)" data-en="Select">选择</button>
      <button class="btn" data-tool="measure" title="测量 (M)" data-en-title="Measure (M)" data-en="Measure">测量</button>
      <button class="btn" data-tool="demolish" title="拆改非承重墙 (X)" data-en-title="Demolish non-bearing walls (X)" data-en="Demolish">拆改墙体</button>
    </div>
    <div class="grp only2d">
      <button class="btn" id="zoomOut" title="缩小" data-en-title="Zoom out">−</button>
      <button class="btn" id="zoomIn" title="放大" data-en-title="Zoom in">＋</button>
      <button class="btn" id="fit" title="适应窗口 (F)" data-en-title="Fit to window (F)" data-en="Fit">适应</button>
      <button class="btn" id="s60" title="按 1:60 显示（与原图同比例）" data-en-title="Show at 1:60 (same scale as the original plan)">1:60</button>
      <button class="btn" id="s100" title="按 1:100 显示" data-en-title="Show at 1:100">1:100</button>
    </div>
    <div class="grp only3d" id="modes3d">
      <button class="btn on" data-mode="orbit" data-en="Orbit">鸟瞰</button>
      <button class="btn" data-mode="walk" data-en="Walk">漫游</button>
    </div>
    <div class="grp only3d">
      <button class="btn" id="vIso" data-en="Iso">斜视</button>
      <button class="btn" id="vTop" data-en="Top">俯视</button>
    </div>
    <div class="grp">
      <button class="btn" id="undo" title="撤销 (Ctrl+Z)" data-en-title="Undo (Ctrl+Z)" data-en="Undo">撤销</button>
      <button class="btn" id="redo" title="重做 (Ctrl+Shift+Z)" data-en-title="Redo (Ctrl+Shift+Z)" data-en="Redo">重做</button>
      <button class="btn danger" id="clearAll" title="清空所有家具家电（可撤销）" data-en-title="Remove all furniture and appliances (undoable)" data-en="Clear">清空布置</button>
    </div>
    <div class="grp only2d" id="layers">
      <button class="btn chip on" data-layer="dims" data-en="Dims">尺寸</button>
      <button class="btn chip on" data-layer="labels" data-en="Rooms">房间</button>
      <button class="btn chip on" data-layer="furn" data-en="Furniture">家具</button>
      <button class="btn chip" data-layer="grid" data-en="Grid">网格</button>
      <button class="btn chip" data-layer="bearing" data-en="Bearing walls">承重墙</button>
      <button class="btn chip on" data-layer="wallSnap" title="拖动家具时贴墙吸附" data-en-title="Snap furniture to walls while dragging" data-en="Wall snap">贴墙吸附</button>
    </div>
    <div class="grp only3d">
      <button class="btn chip on" data-cut="2.8" data-en="Full walls">全高墙</button>
      <button class="btn chip" data-cut="1.2" data-en="Cut walls">剖切墙</button>
    </div>
    <div class="grp only3d" id="toggles3d">
      <button class="btn chip on" data-t="furn" data-en="Furniture">家具</button>
      <button class="btn chip on" data-t="labels" data-en="Labels">房间名</button>
      <button class="btn chip" data-t="night" data-en="Night">夜景</button>
    </div>
    <div class="grp only3d"><label class="range"><span data-en="Sun">日照</span> <input type="range" id="sun" min="7" max="18" step=".25" value="10" style="width:84px"><span id="sunT">10:00</span></label></div>
    <div class="spacer"></div>
    <div class="grp" id="langSel" role="group" aria-label="Language / 语言">
      <button class="btn chip" data-lang="zh" title="简体中文">简</button>
      <button class="btn chip" data-lang="zht" title="繁體中文">繁</button>
      <button class="btn chip" data-lang="en" title="English">EN</button>
    </div>
    <button class="btn" id="fullscreen" title="全屏 (Shift+F)" style="border:1px solid var(--line);background:#fff">⛶ 全屏</button>
    <details class="menu"><summary class="btn" data-en="File ▾">文件 ▾</summary>
      <div class="menu-pop">
        <button class="btn" id="exportPng" data-en="Export image">导出图片</button>
        <button class="btn" id="exportJson" data-en="Export plan JSON">导出方案 JSON</button>
        <button class="btn" id="importJson" data-en="Import plan">导入方案</button>
        <button class="btn danger" id="reset" data-en="Reset to default">重置为默认方案</button>
      </div></details>
    <input type="file" id="fileIn" accept=".json,application/json" hidden>
  </header>
</template>
