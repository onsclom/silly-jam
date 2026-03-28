import { Entity } from "./state";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Exponential decay toward target. Returns new value, snaps to target when close enough. */
export function expDecay(current: number, target: number, speed: number, dt: number, epsilon = 0.001): number {
  const t = 1 - Math.exp((-speed * dt) / 1000);
  const next = current + (target - current) * t;
  return Math.abs(next - target) < epsilon ? target : next;
}

export function isColliding(entity1: Entity, entity2: Entity) {
  const l1 = entity1.x - entity1.w / 2;
  const r1 = entity1.x + entity1.w / 2;
  const t1 = entity1.y - entity1.h / 2;
  const b1 = entity1.y + entity1.h / 2;
  const l2 = entity2.x - entity2.w / 2;
  const r2 = entity2.x + entity2.w / 2;
  const t2 = entity2.y - entity2.h / 2;
  const b2 = entity2.y + entity2.h / 2;
  return l1 < r2 && r1 > l2 && t1 < b2 && b1 > t2;
}
