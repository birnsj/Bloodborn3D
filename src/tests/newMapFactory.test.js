import { describe, expect, it } from 'vitest';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { World, normalizeMapMode } from '../core/World.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import {
  STARTER_ROOM,
  WORLD_SOLID_SHELL,
  boundsWithShell,
  createNewMapLevelData,
  createNewMapWorld,
  normalizeLevelFileName,
  structuralBrushesAreSubtractive,
  STRUCTURAL_BRUSH_KINDS,
} from '../editor/newMapFactory.js';

describe('mapMode helpers', () => {
  it('normalizes map mode', () => {
    expect(normalizeMapMode('subtractive')).toBe('subtractive');
    expect(normalizeMapMode('additive')).toBe('additive');
    expect(normalizeMapMode(undefined)).toBe('additive');
    expect(normalizeMapMode('nope')).toBe('additive');
  });

  it('normalizes level filenames', () => {
    expect(normalizeLevelFileName('My Room')).toBe('My Room.json');
    expect(normalizeLevelFileName('room.json')).toBe('room.json');
    expect(normalizeLevelFileName('  path/evil.json  ')).toBe('evil.json');
    expect(normalizeLevelFileName('')).toBeNull();
  });
});

describe('createNewMapWorld', () => {
  it('builds an additive map with spawn only', () => {
    const world = createNewMapWorld({ name: 'Add Map', mapMode: 'additive' });
    expect(world.mapMode).toBe('additive');
    expect(world.actors).toHaveLength(1);
    expect(world.actors[0].getComponent('PlayerSpawn')).toBeTruthy();
  });

  it('builds a subtractive map with World Solid, starter room carve, and spawn', () => {
    const world = createNewMapWorld({ name: 'Sub Map', mapMode: 'subtractive' });
    expect(world.mapMode).toBe('subtractive');
    expect(world.actors.length).toBeGreaterThanOrEqual(3);

    const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
    expect(solid).toBeTruthy();
    expect(solid.locked).toBe(true);
    const brush = solid.getComponent('Brush');
    expect(brush.operation).toBe('add');
    // Solid hugs the starter room + shell — not a giant empty cube.
    const fitted = boundsWithShell(STARTER_ROOM.min, STARTER_ROOM.max, WORLD_SOLID_SHELL);
    expect(brush.size.x).toBe(fitted.max.x - fitted.min.x);
    expect(brush.size.y).toBe(fitted.max.y - fitted.min.y);
    expect(brush.size.z).toBe(fitted.max.z - fitted.min.z);

    const room = world.actors.find((a) => a.tags?.includes('starter-room'));
    expect(room).toBeTruthy();
    expect(room.getComponent('Brush').operation).toBe('subtract');

    const spawn = world.actors.find((a) => a.getComponent('PlayerSpawn'));
    expect(spawn).toBeTruthy();
  });
});

describe('mapMode serialize round-trip', () => {
  it('preserves subtractive mapMode', () => {
    const world = createNewMapWorld({ name: 'Carve', mapMode: 'subtractive' });
    const json = serializeLevel(world);
    expect(json.mapMode).toBe('subtractive');
    const restored = deserializeLevel(json);
    expect(restored.mapMode).toBe('subtractive');
    expect(serializeLevel(restored).mapMode).toBe('subtractive');
  });

  it('defaults missing mapMode to additive', () => {
    const world = new World({ name: 'Legacy', schemaVersion: 2 });
    const json = serializeLevel(world);
    expect(json.mapMode).toBe('additive');
    delete json.mapMode;
    const restored = deserializeLevel({ ...json, schemaVersion: 2, actors: [] });
    expect(restored.mapMode).toBe('additive');
  });

  it('createNewMapLevelData is loadable', () => {
    const data = createNewMapLevelData({ name: 'Fresh', mapMode: 'additive' });
    const world = deserializeLevel(data);
    expect(world.name).toBe('Fresh');
    expect(world.mapMode).toBe('additive');
  });
});

describe('subtractive structural brushes', () => {
  it('flags structural kinds as subtractive on subtractive maps', () => {
    expect(structuralBrushesAreSubtractive('subtractive')).toBe(true);
    expect(structuralBrushesAreSubtractive('additive')).toBe(false);
    expect(STRUCTURAL_BRUSH_KINDS.has('wall')).toBe(true);
    expect(STRUCTURAL_BRUSH_KINDS.has('ramp')).toBe(false);
  });

  it('can create subtract wall/floor brushes (operation subtract)', () => {
    for (const kind of ['wall', 'floor', 'box', 'ceiling']) {
      const actor = createBrushFromBounds({
        kind,
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 100, z: 100 },
        gridSize: 25,
        operation: 'subtract',
      });
      const brush = actor.getComponent('Brush');
      expect(brush.operation).toBe('subtract');
      expect(brush.collidable).toBe(false);
    }
  });
});
