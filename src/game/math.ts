export type Vec = { x: number; y: number };

export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const angleTo = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x);
export const fromAngle = (angle: number, length = 1): Vec => ({ x: Math.cos(angle) * length, y: Math.sin(angle) * length });
export const normalize = (x: number, y: number): Vec => {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};

/** Smallest signed difference between two angles, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Distance from point p to segment ab. */
export function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const length2 = abx * abx + aby * aby;
  const t = length2 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / length2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** True when point p lies inside a cone at origin facing `angle` with total width `arc` and range `range` (+ target radius). */
export function inCone(origin: Vec, angle: number, arc: number, range: number, p: Vec, radius = 0): boolean {
  const d = dist(origin, p);
  if (d > range + radius) return false;
  if (d < radius + 4) return true;
  return Math.abs(angleDiff(angle, angleTo(origin, p))) <= arc / 2 + Math.atan2(radius, d);
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
