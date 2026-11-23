import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { getCurvedWallColliderSolids } from '../runtime/curvedWallGeometry.js';
import { brushHasMiters } from '../runtime/miteredWallGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { CREATION_CATEGORIES } from '../editor/creation/creationTools.js';

const root = join(process.cwd());

describe('Phase 2D.6 — curved walls acceptance', () => {
  const raw = JSON.parse(
    readFileSync(join(root, 'public/levels/acceptance-curved-walls.json'), 'utf8'),
  );

  it('acceptance scene contains required pieces', () => {
    const world = deserializeLevel(raw);
    const curved = world.actors.filter((a) => a.getComponent('CurvedWall'));
    const walls = world.actors.filter((a) => a.getComponent('Brush') && a.tags?.includes('wall'));
    const spawn = world.actors.find((a) => a.getComponent('PlayerSpawn'));

    expect(curved.length).toBeGreaterThanOrEqual(3); // tower, corridor, arc connector
    expect(curved.some((a) => a.getComponent('CurvedWall').sweepAngle === 360)).toBe(true);
    expect(curved.some((a) => a.getComponent('CurvedWall').sweepAngle === 90)).toBe(true);

    const mitered = walls.filter((a) => brushHasMiters(a.getComponent('Brush')));
    expect(mitered.length).toBeGreaterThanOrEqual(2);

    const gothic = walls.find((a) => a.getComponent('Brush').openings?.some((o) => o.profile === 'gothic'));
    expect(gothic).toBeTruthy();
    expect(spawn).toBeTruthy();
  });

  it('save/reload preserves curved walls, miters, and gothic openings', () => {
    const world = deserializeLevel(raw);
    const again = deserializeLevel(serializeLevel(world));
    const curved = again.actors.filter((a) => a.getComponent('CurvedWall'));
    expect(curved.length).toBeGreaterThanOrEqual(3);
    const gothic = again.actors.find((a) => (
      a.getComponent('Brush')?.openings?.some((o) => o.profile === 'gothic')
    ));
    expect(gothic.getComponent('Brush').openings[0].rise).toBeGreaterThan(0);
    expect(again.actors.some((a) => brushHasMiters(a.getComponent('Brush') || {}))).toBe(true);
  });

  it('tower circle keeps segmented hollow collision', async () => {
    const world = deserializeLevel(raw);
    const tower = world.actors.find((a) => a.name === 'Tower Circle');
    expect(tower).toBeTruthy();
    const wall = tower.getComponent('CurvedWall');
    expect(getCurvedWallColliderSolids(wall).length).toBe(wall.curveResolution);
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(tower.id)).toBe(wall.curveResolution);
    physics.dispose();
  });

  it('creation toolbar lists Curved Wall under Geometry', () => {
    const geometry = CREATION_CATEGORIES.find((c) => c.id === 'geometry');
    expect(geometry.tools.some((t) => t.id === 'curvedWall')).toBe(true);
  });
});
