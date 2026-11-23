/**
 * Rebuild blank-hall.json as a gothic interior matching the reference mockup:
 * tall stone nave, columns, arched windows, vault ribs, grand stairs, chandeliers.
 * Scale: 100 editor units = 1 m.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'levels', 'blank-hall.json');

const MAT_STONE = 'mat_hall_stone';
const MAT_FLOOR = 'mat_hall_floor';
const MAT_CEIL = 'mat_hall_ceiling';
const MAT_WOOD = 'mat_hall_wood';

const HALL_W = 1400; // 14 m
const HALL_L = 2800; // 28 m
const HALL_H = 600; // 6 m tall nave
const WALL_T = 40;
const FLOOR_T = 20;
const HALF_W = HALL_W / 2;
const HALF_L = HALL_L / 2;

function T(pos, rot = [0, 0, 0]) {
  return {
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function brush(id, name, parentId, pos, size, materialId, extra = {}) {
  return {
    id,
    name,
    parentId,
    transform: T(pos, extra.rot || [0, 0, 0]),
    tags: extra.tags || ['structure', 'brush'],
    visible: true,
    locked: false,
    components: [
      {
        id: `${id}_comp`,
        type: 'Brush',
        enabled: true,
        size: { x: size[0], y: size[1], z: size[2] },
        color: extra.color || '#8a9099',
        collidable: extra.collidable !== false,
        materialId,
        faceMaterials: null,
        operation: extra.operation || 'add',
        openings: extra.openings || undefined,
        uv: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
      },
    ],
  };
}

function light(id, name, parentId, pos, opts) {
  return {
    id,
    name,
    parentId,
    transform: T(pos, opts.rot || [0, 0, 0]),
    tags: ['light', opts.lightType || 'point'],
    visible: true,
    locked: false,
    components: [
      {
        id: `${id}_comp`,
        type: 'Light',
        enabled: true,
        lightType: opts.lightType || 'point',
        color: opts.color || '#ffd8a8',
        intensity: opts.intensity,
        range: opts.range ?? 1600,
        castShadow: Boolean(opts.castShadow),
        shadowMapSize: opts.shadowMapSize ?? 1024,
        spotAngle: opts.spotAngle ?? 45,
        spotPenumbra: opts.spotPenumbra ?? 0.25,
      },
    ],
  };
}

function win(id, offset, bottom = 180, width = 140, height = 280) {
  return { id, type: 'window', offset, bottom, width, height };
}

const actors = [];
const cell = 'cell_hall';

actors.push({
  id: cell,
  name: 'Great Hall',
  transform: T([0, 0, 0]),
  tags: ['cell'],
  visible: true,
  locked: false,
  components: [{ id: 'comp_cell', type: 'Cell', enabled: true, color: '#4d7ea8' }],
});

// Floor
actors.push(
  brush('actor_floor', 'Hall Floor', cell, [0, FLOOR_T / 2, 0], [HALL_W, FLOOR_T, HALL_L], MAT_FLOOR, {
    tags: ['structure', 'brush', 'floor'],
    color: '#6a6258',
  }),
);

// Tall side walls with arched-tall windows
const wallY = HALL_H / 2;
const sideOpenings = [-900, -450, 0, 450, 900].map((off, i) =>
  win(`win_side_${i}`, off, 160, 160, 320),
);

actors.push(
  brush(
    'actor_wall_w',
    'Wall West',
    cell,
    [-HALF_W + WALL_T / 2, wallY, 0],
    [WALL_T, HALL_H, HALL_L],
    MAT_STONE,
    { tags: ['structure', 'brush', 'wall'], openings: sideOpenings },
  ),
);
actors.push(
  brush(
    'actor_wall_e',
    'Wall East',
    cell,
    [HALF_W - WALL_T / 2, wallY, 0],
    [WALL_T, HALL_H, HALL_L],
    MAT_STONE,
    {
      tags: ['structure', 'brush', 'wall'],
      openings: sideOpenings.map((o, i) => ({ ...o, id: `win_e_${i}` })),
    },
  ),
);

// North wall (behind stairs) — gallery openings
actors.push(
  brush(
    'actor_wall_n',
    'Wall North',
    cell,
    [0, wallY, -HALF_L + WALL_T / 2],
    [HALL_W, HALL_H, WALL_T],
    MAT_STONE,
    {
      tags: ['structure', 'brush', 'wall'],
      openings: [
        win('win_n_l', -280, 280, 200, 220),
        win('win_n_r', 280, 280, 200, 220),
      ],
    },
  ),
);

// South wall — entry arch (tall door)
actors.push(
  brush(
    'actor_wall_s',
    'Wall South',
    cell,
    [0, wallY, HALF_L - WALL_T / 2],
    [HALL_W, HALL_H, WALL_T],
    MAT_STONE,
    {
      tags: ['structure', 'brush', 'wall'],
      openings: [{ id: 'door_s', type: 'door', offset: 0, bottom: 0, width: 280, height: 380 }],
    },
  ),
);

// Columns (nave pillars) — warm stone shafts + capitals
const colZs = [-1000, -600, -200, 200, 600, 1000];
const colX = HALF_W - 160;
for (const z of colZs) {
  for (const side of [-1, 1]) {
    const x = side * colX;
    const cid = `actor_col_${side < 0 ? 'w' : 'e'}_${z}`;
    actors.push(
      brush(cid, `Column ${side < 0 ? 'W' : 'E'} ${z}`, cell, [x, 250, z], [70, 500, 70], MAT_STONE, {
        tags: ['structure', 'brush', 'column'],
        color: '#9a9088',
      }),
    );
    actors.push(
      brush(
        `${cid}_cap`,
        `Capital ${side < 0 ? 'W' : 'E'} ${z}`,
        cell,
        [x, 520, z],
        [100, 40, 100],
        MAT_STONE,
        { tags: ['structure', 'brush'], color: '#a09890' },
      ),
    );
  }
}

// Ceiling slab
actors.push(
  brush(
    'actor_ceiling',
    'Hall Ceiling',
    cell,
    [0, HALL_H + 10, 0],
    [HALL_W, FLOOR_T, HALL_L],
    MAT_CEIL,
    { tags: ['structure', 'brush', 'ceiling'], color: '#8a8490' },
  ),
);

// Vault ribs (cross + longitudinal beams under ceiling)
for (const z of [-800, -400, 0, 400, 800]) {
  actors.push(
    brush(
      `actor_rib_x_${z}`,
      `Vault Rib ${z}`,
      cell,
      [0, HALL_H - 30, z],
      [HALL_W - 120, 36, 36],
      MAT_STONE,
      { tags: ['structure', 'brush'], color: '#7a747c', collidable: false },
    ),
  );
}
actors.push(
  brush(
    'actor_rib_center',
    'Vault Ridge',
    cell,
    [0, HALL_H - 40, 0],
    [50, 50, HALL_L - 100],
    MAT_STONE,
    { tags: ['structure', 'brush'], color: '#7a747c', collidable: false },
  ),
);

// Upper landing / gallery at north end (behind stairs)
const rise = 300; // 3 m
const landingY = rise + FLOOR_T / 2;
actors.push(
  brush(
    'actor_landing',
    'Upper Gallery',
    cell,
    [0, landingY, -HALF_L + 220],
    [900, FLOOR_T, 400],
    MAT_FLOOR,
    { tags: ['structure', 'brush', 'floor'], color: '#6a6258' },
  ),
);

// Grand staircase — wide, facing north (−Z), centered
actors.push({
  id: 'actor_stairs',
  name: 'Grand Stairs',
  parentId: cell,
  transform: T([0, rise / 2, -HALF_L + 520]),
  tags: ['structure', 'stair'],
  visible: true,
  locked: false,
  components: [
    {
      id: 'comp_stairs',
      type: 'Stair',
      enabled: true,
      stairType: 'straight',
      width: 360,
      stepCount: 15,
      stepHeight: 20,
      treadDepth: 32,
      direction: 'z-',
      color: '#8a9099',
      collidable: true,
      materialId: MAT_STONE,
    },
  ],
});

// Stair cheek walls
actors.push(
  brush(
    'actor_stair_rail_l',
    'Stair Rail L',
    cell,
    [-210, 160, -HALF_L + 520],
    [40, 320, 500],
    MAT_STONE,
    { tags: ['structure', 'brush'], color: '#8a9099' },
  ),
);
actors.push(
  brush(
    'actor_stair_rail_r',
    'Stair Rail R',
    cell,
    [210, 160, -HALF_L + 520],
    [40, 320, 500],
    MAT_STONE,
    { tags: ['structure', 'brush'], color: '#8a9099' },
  ),
);

// Side benches / tables for scale
for (const z of [-400, 200, 800]) {
  actors.push(
    brush(`actor_bench_${z}`, `Bench ${z}`, cell, [-400, 45, z], [200, 50, 60], MAT_WOOD, {
      tags: ['structure', 'brush', 'prop'],
      color: '#5a4030',
    }),
  );
  actors.push(
    brush(`actor_bench_r_${z}`, `Bench R ${z}`, cell, [400, 45, z], [200, 50, 60], MAT_WOOD, {
      tags: ['structure', 'brush', 'prop'],
      color: '#5a4030',
    }),
  );
}

// Chandeliers — cool bluish pools (dim vs window moonlight so interior stays darker)
const chandeliers = [
  { id: 'c1', z: -700, intensity: 4.5 },
  { id: 'c2', z: -100, intensity: 5.5 },
  { id: 'c3', z: 500, intensity: 4.5 },
];
for (const c of chandeliers) {
  actors.push(
    light(`actor_chand_${c.id}`, `Chandelier ${c.id}`, cell, [0, 480, c.z], {
      // Spot at actor with default target (0,-1,0) → shines downward
      lightType: 'spot',
      color: '#6a8eb8',
      intensity: c.intensity,
      range: 900,
      spotAngle: 42,
      spotPenumbra: 0.5,
      castShadow: true,
      shadowMapSize: 1024,
    }),
  );
  // Small decorative box as chandelier body
  actors.push(
    brush(
      `actor_chand_mesh_${c.id}`,
      `Chandelier Body ${c.id}`,
      cell,
      [0, 400, c.z],
      [40, 60, 40],
      MAT_WOOD,
      { tags: ['structure', 'brush', 'prop'], color: '#4a3a30', collidable: false },
    ),
  );
}

// Window moonlight — brighter outside-in wash so openings feel lit vs dark nave
for (const z of [-900, -450, 0, 450, 900]) {
  for (const side of [-1, 1]) {
    actors.push(
      light(
        `actor_winlight_${side < 0 ? 'w' : 'e'}_${z}`,
        `Window Light ${side < 0 ? 'W' : 'E'} ${z}`,
        cell,
        [side * (HALF_W - 60), 340, z],
        {
          lightType: 'point',
          color: '#7eb0ff',
          intensity: 8,
          range: 800,
          castShadow: false,
        },
      ),
    );
  }
}

actors.push(
  light('actor_ambient', 'Hall Ambient', cell, [0, 300, 0], {
    lightType: 'ambient',
    color: '#2a3858',
    // Near-black fill — nave stays dark; windows/moonlight do the work.
    intensity: 0.05,
    range: 0,
  }),
);

// Cool moonlight key from high / side (outside brighter than deep interior)
actors.push(
  light('actor_fill', 'Hall Moonlight', cell, [400, 900, 600], {
    lightType: 'directional',
    color: '#6a8ec0',
    intensity: 0.35,
    range: 0,
    rot: [-42, 40, 0],
    castShadow: true,
    shadowMapSize: 2048,
  }),
);

// Spawn at south end looking toward stairs (north / −Z)
actors.push({
  id: 'actor_player_spawn',
  name: 'Player Spawn',
  parentId: cell,
  transform: T([0, 20, HALF_L - 200], [0, 180, 0]),
  tags: ['spawn'],
  visible: true,
  locked: false,
  components: [
    {
      id: 'comp_spawn',
      type: 'PlayerSpawn',
      enabled: true,
      eyeHeight: 160,
      moveSpeed: 450,
    },
  ],
});

const level = {
  schemaVersion: 2,
  name: 'Blank Hall',
  actors,
};

writeFileSync(out, `${JSON.stringify(level, null, 2)}\n`);
console.log(`wrote ${out} (${actors.length} actors)`);
