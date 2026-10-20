/** Shared runtime bridge between 2D / 3D engines */
export const bridge = {
  View3D: null,
  /** @type {null | ((sel: any) => void)} */
  select: null,
  closeDrawers: null,
  /** populated by initPlan2D — 3D reads these */
  api: null,
};
