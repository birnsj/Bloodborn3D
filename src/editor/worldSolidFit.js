import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4TransformPoint } from '../core/math3d.js';
import { isSubtractBrush, isWorldSolidActor } from '../runtime/brushBoolean.js';
import { WORLD_SOLID_SHELL } from './newMapFactory.js';

/**
 * World-space AABB of a brush actor (axis-aligned from 8 corners).
 */
export function brushActorWorldAabb(actor) {
  const brush = actor?.getComponent?.('Brush');
  if (!brush?.size) return null;
  const m = getWorldMatrix(actor, actor.world);
  const hx = brush.size.x * 0.5;
  const hy = brush.size.y * 0.5;
  const hz = brush.size.z * 0.5;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = mat4TransformPoint(m, {
          x: sx * hx,
          y: sy * hy,
          z: sz * hz,
        });
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        maxZ = Math.max(maxZ, p.z);
      }
    }
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function snapDown(v, g) {
  return Math.floor(v / g) * g;
}

function snapUp(v, g) {
  return Math.ceil(v / g) * g;
}

/**
 * Grow locked World Solid so it always shells all subtract volumes.
 * Designers should not manually resize World Solid on subtractive maps.
 * @returns {boolean} true if the solid was resized / moved
 */
export function ensureWorldSolidContainsSubtracts(world, {
  gridSize = 25,
  shell = WORLD_SOLID_SHELL,
} = {}) {
  if (!world || world.mapMode !== 'subtractive') return false;
  const solid = world.actors?.find((a) => isWorldSolidActor(a));
  if (!solid) return false;
  const solidBrush = solid.getComponent?.('Brush');
  if (!solidBrush) return false;

  let union = null;
  for (const actor of world.actors) {
    if (isWorldSolidActor(actor)) continue;
    const brush = actor.getComponent?.('Brush');
    if (!brush || !isSubtractBrush(brush)) continue;
    const aabb = brushActorWorldAabb(actor);
    if (!aabb) continue;
    if (!union) {
      union = {
        min: { ...aabb.min },
        max: { ...aabb.max },
      };
    } else {
      union.min.x = Math.min(union.min.x, aabb.min.x);
      union.min.y = Math.min(union.min.y, aabb.min.y);
      union.min.z = Math.min(union.min.z, aabb.min.z);
      union.max.x = Math.max(union.max.x, aabb.max.x);
      union.max.y = Math.max(union.max.y, aabb.max.y);
      union.max.z = Math.max(union.max.z, aabb.max.z);
    }
  }
  if (!union) return false;

  const g = Math.max(1, gridSize);
  const s = Math.max(0, Number(shell) || 0);
  const needMin = {
    x: snapDown(union.min.x - s, g),
    y: snapDown(union.min.y - s, g),
    z: snapDown(union.min.z - s, g),
  };
  const needMax = {
    x: snapUp(union.max.x + s, g),
    y: snapUp(union.max.y + s, g),
    z: snapUp(union.max.z + s, g),
  };

  const cur = brushActorWorldAabb(solid);
  if (!cur) return false;

  const nextMin = {
    x: Math.min(cur.min.x, needMin.x),
    y: Math.min(cur.min.y, needMin.y),
    z: Math.min(cur.min.z, needMin.z),
  };
  const nextMax = {
    x: Math.max(cur.max.x, needMax.x),
    y: Math.max(cur.max.y, needMax.y),
    z: Math.max(cur.max.z, needMax.z),
  };

  const same = nextMin.x === cur.min.x && nextMin.y === cur.min.y && nextMin.z === cur.min.z
    && nextMax.x === cur.max.x && nextMax.y === cur.max.y && nextMax.z === cur.max.z;
  if (same) return false;

  solidBrush.size = {
    x: nextMax.x - nextMin.x,
    y: nextMax.y - nextMin.y,
    z: nextMax.z - nextMin.z,
  };
  solid.transform.position = {
    x: (nextMin.x + nextMax.x) * 0.5,
    y: (nextMin.y + nextMax.y) * 0.5,
    z: (nextMin.z + nextMax.z) * 0.5,
  };
  return true;
}