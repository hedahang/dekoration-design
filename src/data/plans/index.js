import threeBed from './three-bed.js';
import compact2br from './compact-2br.js';
import blank from './blank.js';

/** 在此注册新户型模板 */
export const PLANS = Object.freeze([threeBed, compact2br, blank]);

export const DEFAULT_PLAN_ID = threeBed.id;

export function listPlans() {
  return PLANS.map(p => ({
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    subtitle: p.subtitle,
    subtitleEn: p.subtitleEn,
  }));
}

export function getPlan(id) {
  return PLANS.find(p => p.id === id) || PLANS.find(p => p.id === DEFAULT_PLAN_ID) || PLANS[0];
}

export function hasPlan(id) {
  return PLANS.some(p => p.id === id);
}
