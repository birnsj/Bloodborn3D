import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import {
  LEVEL_SCHEMA_VERSION,
  LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX,
  MIN_SUPPORTED_LEVEL_SCHEMA_VERSION,
  serializeLevel,
} from '../serialization/LevelSerializer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const levelsDir = path.join(root, 'public/levels');

function minimalLevel(schemaVersion) {
  return {
    schemaVersion,
    name: 'Schema Probe',
    actors: [
      {
        id: 'probe',
        name: 'Probe',
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        components: [],
      },
    ],
  };
}

describe('level schemaVersion gate (M9)', () => {
  it('rejects a future schema version with an explicit message', () => {
    const future = LEVEL_SCHEMA_VERSION + 1;
    expect(() => deserializeLevel(minimalLevel(future))).toThrow(
      new RegExp(`Unsupported level schemaVersion ${future}`),
    );
  });

  it('names the supported range so the user knows what to do', () => {
    expect(() => deserializeLevel(minimalLevel(99))).toThrow(
      new RegExp(`${MIN_SUPPORTED_LEVEL_SCHEMA_VERSION}.${LEVEL_SCHEMA_VERSION}`),
    );
  });

  it.each([0, -1, 1.5, '2', 'two', NaN, true, {}])(
    'rejects malformed schemaVersion %j',
    (bad) => {
      expect(() => deserializeLevel(minimalLevel(bad))).toThrow(/schemaVersion/);
    },
  );

  it('still reports a missing schemaVersion', () => {
    const data = minimalLevel(2);
    delete data.schemaVersion;
    expect(() => deserializeLevel(data)).toThrow(/missing schemaVersion/);
  });

  it.each(
    Array.from(
      { length: LEVEL_SCHEMA_VERSION - MIN_SUPPORTED_LEVEL_SCHEMA_VERSION + 1 },
      (_, i) => MIN_SUPPORTED_LEVEL_SCHEMA_VERSION + i,
    ),
  )('accepts supported schema version %i', (version) => {
    const world = deserializeLevel(minimalLevel(version));
    expect(world.getActor('probe')).toBeTruthy();
    // Levels without ConvexBrush keep writing schema 2 (Phase 2F.0).
    expect(serializeLevel(world).schemaVersion).toBe(LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX);
    expect(LEVEL_SCHEMA_VERSION).toBe(3);
  });

  it('loads every shipped level and tutorial starter unchanged in behavior', () => {
    const files = [];
    for (const entry of readdirSync(levelsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(path.join(levelsDir, entry.name));
      } else if (entry.isDirectory()) {
        for (const nested of readdirSync(path.join(levelsDir, entry.name))) {
          if (nested.endsWith('.json')) files.push(path.join(levelsDir, entry.name, nested));
        }
      }
    }
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      expect(() => deserializeLevel(data), path.basename(file)).not.toThrow();
    }
  });
});
