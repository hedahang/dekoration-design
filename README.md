# 户型装修设计

中文 | [English](README.en.md)

纯前端的户型装修设计工具：在 2D 平面图上摆放家具、拆改墙体、测量尺寸，一键切换到 Three.js 3D 场景，可以鸟瞰，也可以第一人称漫游。

当前主工程为 **Vue 3 + Vite** 渐进式拆分版；原单文件备份为 [`legacy-index.html`](legacy-index.html)，仍可双击打开对照。

## 功能

**2D 平面布置**
- 按原始户型 1:60 / 1:100 比例显示，尺寸单位 mm
- 从左侧家具库拖入 60 余种家具家电（卧室、客厅、餐厨、卫浴、家电、书房休闲）
- 拖动移动、旋转（Shift 自由角度）、调整尺寸，贴墙自动吸附
- 测量工具（靠近墙面自动吸附，Shift 锁定水平 / 垂直）
- 拆改非承重墙，承重墙单独标示
- 简易画墙：轴对齐 120mm 隔墙，吸附墙角；「拆改」可删除自建墙
- **自建户型（一期）**：户型菜单选「空白户型」→「外框」拖矩形 →「画墙」加隔墙，自动识别房间
- 图层开关：尺寸标注、房间名、家具、网格、承重墙

**3D 场景**
- 鸟瞰、斜视、俯视多种视角，点击房间列表可飞到对应房间
- 漫游模式：桌面端 WASD + 鼠标，触屏设备用虚拟摇杆，可以点门开关
- 全高墙 / 剖切墙切换，日照时间滑块，夜景灯光
- 精细家具模型：柜门分缝与拉手、软包床头、带环境反射的金属与陶瓷材质等
- 在 3D 中也能选中、拖动家具，与 2D 方案实时同步

**方案与统计**
- 多户型模板切换（顶栏「户型」菜单）：各户型方案独立保存在本地
- 房间面积与套内使用面积自动统计
- 为每个房间更换地面材料（木地板、地砖、大理石、水磨石、地毯等），按面积加 5% 损耗估算造价
- 撤销 / 重做，方案自动保存在浏览器本地
- 中文 / English 界面切换（顶栏右侧按钮，默认中文，选择会记住）
- 导出 PNG 图片，导出 / 导入方案 JSON（含 `planId`，导入时可自动切到对应户型）

## 快速开始（Vue 版）

```bash
git clone <仓库地址>
cd <仓库目录>
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

### 无构建对照（Legacy）

直接用浏览器打开 `legacy-index.html`，或：

```bash
python -m http.server 8000
# 访问 http://localhost:8000/legacy-index.html
```

> Legacy 版 Three.js 通过 jsDelivr CDN 加载；Vue 版通过 npm 依赖 `three@0.160.0`，构建后可离线使用。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `T` | 切换 2D / 3D |
| `V` / `M` / `B` / `W` / `X` | 选择 / 测量 / 外框 / 画墙 / 拆改墙体 |
| `R` / `Shift+R` | 选中家具顺时针 / 逆时针旋转 90° |
| `Delete` / `Backspace` | 删除选中家具 |
| `Ctrl/⌘ + D` | 复制选中家具 |
| `Ctrl/⌘ + Z`，`Ctrl/⌘ + Shift + Z` | 撤销，重做 |
| `F` | 适应窗口 |
| `+` / `-` | 放大 / 缩小 |
| `[` / `]` | 展开 / 收起左侧家具库、右侧面板 |
| `Shift + F` | 全屏 |
| `Esc` | 取消当前操作 |
| 漫游：`WASD` / 方向键，`Shift`，`E` | 移动，快走，开关门 |

## 技术栈

- Vue 3（Composition API）+ Vite
- 2D 平面图用 SVG（`src/engine/plan2d.js`）
- 3D 场景用 [Three.js](https://threejs.org/) r160（`src/engine/view3d.js`）
- 方案数据保存在 `localStorage`：`huxing-design-v2:<planId>`（首次打开会把旧版 `huxing-design-v1` 迁到默认三居）

主要目录：

```
src/
  components/     # UI 壳（Header / 家具库 / 画布 / 面板）
  data/
    shared.js     # 材料 / 家具库等跨户型共享
    plans/        # 各户型几何与默认布置（新增模板放这里）
    floorplan.js  # 当前激活户型运行时 + 存档
  engine/         # 2D / 3D 命令式引擎
  store/          # 方案状态与撤销重做
  i18n.js         # 简 / 繁 / EN
legacy-index.html # 原单文件备份
```

## 自定义 / 新增户型

1. 在 [`src/data/plans/`](src/data/plans/) 新增模块（可参考 `three-bed.js`、`compact-2br.js`）
2. 在 [`src/data/plans/index.js`](src/data/plans/index.js) 的 `PLANS` 列表中注册
3. 户型字段要点：
   - `walls` / `windows` / `doors` / `slides` / `rooms`：几何
   - `center` / `bounds` / `walkStart`：2D 适应窗口与 3D 原点、漫游起点
   - `dimChains` / `entryMark` / `lintels`：尺寸标注、入户箭头、额外过梁
   - `furniture`：默认布置（`[type, name, cx, cy, w, d, rot?, color?]`）

跨户型共享的地面材料与家具库在 [`src/data/shared.js`](src/data/shared.js)。  
3D 家具模型在 [`src/engine/furniture3d.js`](src/engine/furniture3d.js) 的 `buildFurniture()`。

## 社交媒体

- X（Twitter）：[@akokoi1](https://x.com/akokoi1)

## 许可协议

[MIT](LICENSE)
