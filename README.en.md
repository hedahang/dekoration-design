# Floor Plan Interior Designer

[中文](README.md) | English

A pure front-end tool for interior design on a floor plan: place furniture, remove or modify walls, and take measurements on a 2D plan, then switch to a Three.js 3D scene with one click — view it from above or walk through it in first person.

The main app is a progressive **Vue 3 + Vite** split. The original single-file build is kept as [`legacy-index.html`](legacy-index.html) for comparison.

## Features

**2D Floor Plan**
- Displays the original floor plan at 1:60 / 1:100 scale, dimensions in mm
- Drag 60+ furniture and appliance items from the library on the left (bedroom, living room, dining & kitchen, bathroom, appliances, study & leisure)
- Move, rotate (hold Shift for free angle), and resize items, with automatic snapping to walls
- Measuring tool (snaps to nearby walls; hold Shift to lock horizontal / vertical)
- Remove or modify non-load-bearing walls; load-bearing walls are marked separately
- Simple wall drawing: axis-aligned 120mm partitions with snap; delete custom walls via Demolish
- **DIY floor plan (phase 1)**: Plan menu → Blank plan → Frame tool → Wall tool; rooms are detected automatically
- Layer toggles: dimensions, room names, furniture, grid, load-bearing walls

**3D Scene**
- Bird's-eye, oblique, and top-down views; click a room in the list to fly to it
- Walkthrough mode: WASD + mouse on desktop, virtual joystick on touch devices; click doors to open / close them
- Toggle between full-height and cut-away walls, time-of-day sunlight slider, night lighting
- Detailed furniture models: cabinet door gaps and handles, upholstered headboards, metal and ceramic materials with environment reflections, and more
- Select and drag furniture in 3D as well, kept in sync with the 2D plan in real time

**Plans & Statistics**
- Switch between floor-plan templates via the **Plan** menu (each plan’s layout is saved separately in local storage)
- Automatic calculation of room areas and net usable floor area
- Change the floor material of each room (wood, tiles, marble, terrazzo, carpet, etc.), with cost estimates based on area plus 5% wastage
- Undo / redo; plans are auto-saved in the browser's local storage
- Chinese / English UI toggle (button on the right of the top bar; defaults to Chinese and remembers your choice)
- Export to PNG, export / import plans as JSON (includes `planId`; import can switch templates)

## Quick Start (Vue)

```bash
git clone <repository-url>
cd <repository-directory>
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

### Legacy (no build)

Open `legacy-index.html` in a browser, or serve the folder statically. The Vue build uses npm `three@0.160.0`; the legacy file still loads Three.js from the jsDelivr CDN.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `T` | Toggle 2D / 3D |
| `V` / `M` / `B` / `W` / `X` | Select / Measure / Frame / Draw wall / Modify walls |
| `R` / `Shift+R` | Rotate selected furniture 90° clockwise / counterclockwise |
| `Delete` / `Backspace` | Delete selected furniture |
| `Ctrl/⌘ + D` | Duplicate selected furniture |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` | Undo, redo |
| `F` | Fit to window |
| `+` / `-` | Zoom in / out |
| `[` / `]` | Show / hide the furniture library (left) and the side panel (right) |
| `Shift + F` | Fullscreen |
| `Esc` | Cancel current action |
| Walkthrough: `WASD` / arrow keys, `Shift`, `E` | Move, walk faster, open / close doors |

## Tech Stack

- Vue 3 (Composition API) + Vite
- 2D plan: SVG (`src/engine/plan2d.js`)
- 3D: [Three.js](https://threejs.org/) r160 (`src/engine/view3d.js`)
- Plans in `localStorage` under `huxing-design-v2:<planId>` (legacy `huxing-design-v1` is migrated into the default 3BR on first load)

## Customizing / Adding Floor Plans

1. Add a module under [`src/data/plans/`](src/data/plans/) (see `three-bed.js`, `compact-2br.js`)
2. Register it in [`src/data/plans/index.js`](src/data/plans/index.js) (`PLANS`)
3. Key fields: geometry (`walls`, `windows`, `doors`, `slides`, `rooms`), `center` / `bounds` / `walkStart`, optional `dimChains` / `entryMark` / `lintels`, and default `furniture`

Shared materials and the furniture library live in [`src/data/shared.js`](src/data/shared.js). 3D furniture models: `src/engine/furniture3d.js` (`buildFurniture`).

## Social Media

- X (Twitter): [@akokoi1](https://x.com/akokoi1)

## License

[MIT](LICENSE)
