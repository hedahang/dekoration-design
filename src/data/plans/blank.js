/**
 * 空白可编辑户型 —— 从零画外框与内墙，自动成房间
 */
export default {
  id: 'blank',
  name: '空白户型',
  nameEn: 'Blank plan',
  subtitle: '自建 · 先画外框，再画隔墙',
  subtitleEn: 'DIY · draw frame, then partitions',
  editable: true,
  center: [5000, 5000],
  bounds: { x: -1500, y: -1500, w: 13000, h: 13000 },
  walkStart: { pos: [5000, 9000], look: [5000, 5000] },
  entryMark: null,
  dimChains: [],
  walls: [],
  wallIds: [],
  windows: [],
  doors: [],
  slides: [],
  lintels: [],
  rooms: [],
  furniture: [],
};
