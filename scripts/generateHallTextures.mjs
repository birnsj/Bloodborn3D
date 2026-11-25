/**
 * High-detail procedural PBR textures for the gothic hall.
 * Generates albedo / normal / roughness maps + baked material sphere thumbnails.
 * No external deps — PNG via zlib.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const texDir = join(root, 'public/assets/textures');
const matDir = join(root, 'public/assets/materials');
const previewDir = join(root, 'public/assets/previews');
const registryPath = join(root, 'public/assets/registry.json');

mkdirSync(texDir, { recursive: true });
mkdirSync(matDir, { recursive: true });
mkdirSync(previewDir, { recursive: true });

// 2048² → 1 m (100 editor units) = 2048 px/m, matching brushGeometry TARGET_TEXEL_DENSITY.
const SIZE = 2048;
const SPHERE_SIZE = 384;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePngBuffer(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 6 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix3(c0, c1, t) {
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
  ];
}

function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function valueNoise(x, y, scale) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x, y, octaves = 4, scale = 64) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, scale / freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Height field → tangent-space normal (OpenGL: +Y up). */
function heightToNormal(heightFn, x, y, w, h, strength = 4) {
  const xm = (x - 1 + w) % w;
  const xp = (x + 1) % w;
  const ym = (y - 1 + h) % h;
  const yp = (y + 1) % h;
  const dx = (heightFn(xp, y) - heightFn(xm, y)) * strength;
  const dy = (heightFn(x, yp) - heightFn(x, ym)) * strength;
  const nx = -dx;
  const ny = -dy;
  const nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [
    clamp((nx / len) * 0.5 * 255 + 128),
    clamp((ny / len) * 0.5 * 255 + 128),
    clamp((nz / len) * 0.5 * 255 + 128),
    255,
  ];
}

function sampleMap(map, x, y, w) {
  const ix = ((Math.floor(x) % w) + w) % w;
  const iy = ((Math.floor(y) % w) + w) % w;
  const i = (iy * w + ix) * 4;
  return [map[i], map[i + 1], map[i + 2], map[i + 3]];
}

function sampleMapBilinear(map, x, y, w) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const c00 = sampleMap(map, x0, y0, w);
  const c10 = sampleMap(map, x0 + 1, y0, w);
  const c01 = sampleMap(map, x0, y0 + 1, w);
  const c11 = sampleMap(map, x0 + 1, y0 + 1, w);
  const out = [0, 0, 0, 255];
  for (let k = 0; k < 3; k++) {
    const a = lerp(c00[k], c10[k], fx);
    const b = lerp(c01[k], c11[k], fx);
    out[k] = Math.round(lerp(a, b, fy));
  }
  return out;
}

function fillMap(w, h, fn) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

// ── Surface generators ──────────────────────────────────────────────────────

// Large ashlar drawn in pixels at 1 m / 2048 tile (uvScale stays 1 — never enlarge via UV).
// ~0.5 × 0.25 m blocks → 2 across / 4 courses per meter.
const STONE_BW = 1024;
const STONE_BH = 512;

const STONE_MORTAR = 28;

function stoneCell(x, y) {
  const bx = Math.floor(x / STONE_BW);
  const by = Math.floor(y / STONE_BH);
  const ox = (by % 2) * (STONE_BW / 2);
  const lx = (x + ox) % STONE_BW;
  const ly = y % STONE_BH;
  const m = STONE_MORTAR;
  const mortar = lx < m || ly < m || lx > STONE_BW - m || ly > STONE_BH - m;
  return { bx, by, ox, lx, ly, mortar };
}

function stoneHeight(x, y) {
  const { bx, by, ox, lx, ly, mortar } = stoneCell(x, y);
  if (mortar) return 0.04 + fbm(x, y, 3, 6) * 0.06;
  // Soft bevel into mortar + slight per-block thickness
  const m = STONE_MORTAR;
  const edge = Math.min(lx - m, STONE_BW - m - lx, ly - m, STONE_BH - m - ly);
  const bevel = Math.max(0, Math.min(1, edge / 48));
  const block = 0.62 + hash(bx + ox, by) * 0.22;
  const grain = fbm(x, y, 6, 22) * 0.22;
  const pits = valueNoise(x, y, 5) > 0.88 ? -0.08 : 0;
  return Math.min(1, block * (0.35 + bevel * 0.65) + grain + pits);
}

function stoneAlbedo(x, y) {
  const h = stoneHeight(x, y);
  const { bx, by, ox, mortar } = stoneCell(x, y);
  const tint = hash(bx + ox, by);
  const warm = mix3([88, 84, 78], [128, 122, 112], tint);
  const cool = mix3([78, 84, 92], [118, 122, 130], tint);
  const base = mix3(warm, cool, 0.45 + fbm(x, y, 3, 40) * 0.3);
  const speck = (hash(x * 3, y * 5) - 0.5) * 18;
  if (mortar) {
    const m = 48 + fbm(x, y, 2, 6) * 14;
    return [clamp(m), clamp(m - 2), clamp(m - 4), 255];
  }
  const shade = 0.72 + h * 0.28;
  return [
    clamp(base[0] * shade + speck),
    clamp(base[1] * shade + speck),
    clamp(base[2] * shade + speck * 0.8),
    255,
  ];
}

function stoneRough(x, y) {
  const h = stoneHeight(x, y);
  const { mortar } = stoneCell(x, y);
  // Polished block faces (low) vs porous mortar (high)
  const polish = fbm(x, y, 3, 28);
  const face = 72 + (1 - h) * 55 + polish * 35;
  const v = mortar ? 210 + fbm(x, y, 2, 8) * 25 : face;
  const c = clamp(v);
  return [c, c, c, 255];
}

// Flagstones ~0.6 m when tiled at wall-module UV scale.
const FLOOR_T = 420;

const FLOOR_SEAM = 12;

function floorHeight(x, y) {
  const bx = Math.floor(x / FLOOR_T);
  const by = Math.floor(y / FLOOR_T);
  const lx = x % FLOOR_T;
  const ly = y % FLOOR_T;
  const s = FLOOR_SEAM;
  const seam = lx < s || ly < s || lx > FLOOR_T - s || ly > FLOOR_T - s;
  if (seam) return 0.05 + fbm(x, y, 2, 5) * 0.05;
  const edge = Math.min(lx - s, FLOOR_T - s - lx, ly - s, FLOOR_T - s - ly);
  const bevel = Math.max(0, Math.min(1, edge / 28));
  const tile = 0.55 + hash(bx, by) * 0.28;
  const wear = fbm(x, y, 6, 28) * 0.18;
  const dish = Math.sin((lx / FLOOR_T) * Math.PI) * Math.sin((ly / FLOOR_T) * Math.PI) * 0.06;
  return Math.min(1, tile * (0.4 + bevel * 0.6) + wear + dish);
}

function floorAlbedo(x, y) {
  const h = floorHeight(x, y);
  const bx = Math.floor(x / FLOOR_T);
  const by = Math.floor(y / FLOOR_T);
  const lx = x % FLOOR_T;
  const ly = y % FLOOR_T;
  const s = FLOOR_SEAM;
  const seam = lx < s || ly < s || lx > FLOOR_T - s || ly > FLOOR_T - s;
  const tint = hash(bx, by);
  const base = mix3([112, 102, 88], [168, 156, 136], tint);
  const wear = fbm(x * 1.2, y * 1.1, 4, 20) * 20 - 8;
  if (seam) {
    const m = 52 + fbm(x, y, 2, 5) * 12;
    return [clamp(m), clamp(m - 3), clamp(m - 6), 255];
  }
  const shade = 0.74 + h * 0.38;
  return [
    clamp(base[0] * shade + wear),
    clamp(base[1] * shade + wear),
    clamp(base[2] * shade + wear * 0.7),
    255,
  ];
}

function floorRough(x, y) {
  const h = floorHeight(x, y);
  const lx = x % FLOOR_T;
  const ly = y % FLOOR_T;
  const s = FLOOR_SEAM;
  const seam = lx < s || ly < s || lx > FLOOR_T - s || ly > FLOOR_T - s;
  // Worn-polished flagstones: center of tile is shinier
  const center = Math.sin((lx / FLOOR_T) * Math.PI) * Math.sin((ly / FLOOR_T) * Math.PI);
  const polish = 55 + (1 - center) * 50 + (1 - h) * 40 + fbm(x, y, 3, 16) * 28;
  const v = seam ? 215 : polish;
  const c = clamp(v);
  return [c, c, c, 255];
}

function plasterHeight(x, y) {
  const orangePeel = fbm(x, y, 7, 36) * 0.28;
  const bumps = valueNoise(x, y, 7) * 0.1;
  const rollers = Math.sin(x * 0.04 + fbm(x, y, 2, 80) * 2) * 0.04;
  return 0.5 + orangePeel + bumps + rollers;
}

function plasterAlbedo(x, y) {
  const h = plasterHeight(x, y);
  const n = fbm(x, y, 4, 32);
  const base = mix3([168, 164, 156], [210, 206, 198], n);
  const crack = valueNoise(x, y, 90) > 0.92 ? -18 : 0;
  const shade = 0.86 + h * 0.18;
  return [
    clamp(base[0] * shade + crack),
    clamp(base[1] * shade + crack),
    clamp(base[2] * shade + crack),
    255,
  ];
}

function plasterRough(x, y) {
  const h = plasterHeight(x, y);
  // Mostly matte with slight sheen on flatter patches
  const v = 155 + (1 - h) * 55 + fbm(x, y, 3, 14) * 30;
  const c = clamp(v);
  return [c, c, c, 255];
}

// Plank width ~0.2 m at wall-module UV scale.
const WOOD_W = 140;

function woodHeight(x, y) {
  const band = Math.floor(x / WOOD_W);
  const lx = x % WOOD_W;
  const gap = lx < 5 || lx > WOOD_W - 5;
  if (gap) return 0.08 + fbm(x, y, 2, 5) * 0.05;
  const grain = Math.sin(y * 0.11 + hash(band, 0) * 8 + fbm(x, y, 2, 40) * 1.5) * 0.5 + 0.5;
  const fine = fbm(x * 2.2, y, 5, 9);
  const pore = valueNoise(x, y, 2.5);
  const bevel = Math.min(lx - 5, WOOD_W - 5 - lx) / 12;
  return 0.35 + grain * 0.28 + fine * 0.22 + pore * 0.1 + Math.max(0, Math.min(1, bevel)) * 0.08;
}

function woodAlbedo(x, y) {
  const band = Math.floor(x / WOOD_W);
  const lx = x % WOOD_W;
  const gap = lx < 5 || lx > WOOD_W - 5;
  const odd = band % 2;
  const grain = Math.sin(y * 0.14 + hash(band, 1) * 6) * 14;
  const base = odd ? [142, 96, 58] : [122, 80, 48];
  const fine = (fbm(x, y, 3, 8) - 0.5) * 16;
  const h = woodHeight(x, y);
  if (gap) {
    const m = 48 + fbm(x, y, 2, 4) * 10;
    return [clamp(m + 8), clamp(m), clamp(m - 6), 255];
  }
  const shade = 0.72 + h * 0.42;
  return [
    clamp(base[0] * shade + grain + fine),
    clamp(base[1] * shade + grain * 0.55 + fine * 0.7),
    clamp(base[2] * shade + fine * 0.4),
    255,
  ];
}

function woodRough(x, y) {
  const h = woodHeight(x, y);
  const lx = x % WOOD_W;
  const gap = lx < 5 || lx > WOOD_W - 5;
  // Satin varnish on plank faces; rough in pores/gaps
  const varnish = 48 + (1 - h) * 70 + fbm(x, y, 3, 12) * 35;
  const v = gap ? 200 : varnish;
  const c = clamp(v);
  return [c, c, c, 255];
}

/** Soft raytraced sphere bake using albedo + normal + roughness maps. */
function bakeSphere(albedo, normal, roughness, mapSize, outSize) {
  const out = Buffer.alloc(outSize * outSize * 4);
  const key = [0.55, 0.75, 0.45];
  const keyLen = Math.hypot(...key);
  const kd = key.map((v) => v / keyLen);
  const fill = [-0.35, 0.25, -0.55];
  const fillLen = Math.hypot(...fill);
  const fd = fill.map((v) => v / fillLen);
  const rim = [0.1, 0.2, -0.9];
  const rimLen = Math.hypot(...rim);
  const rd = rim.map((v) => v / rimLen);

  for (let py = 0; py < outSize; py++) {
    for (let px = 0; px < outSize; px++) {
      const u = (px + 0.5) / outSize * 2 - 1;
      const v = 1 - (py + 0.5) / outSize * 2;
      const r2 = u * u + v * v;
      const i = (py * outSize + px) * 4;
      if (r2 > 1) {
        out[i] = 18;
        out[i + 1] = 20;
        out[i + 2] = 24;
        out[i + 3] = 255;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      // Sphere normal in view space
      let nx = u;
      let ny = v;
      let nz = z;
      // Spherical UVs
      const su = Math.atan2(nx, nz) / (Math.PI * 2) + 0.5;
      const sv = Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const alb = sampleMapBilinear(albedo, su * mapSize, sv * mapSize, mapSize);
      const nrm = sampleMapBilinear(normal, su * mapSize, sv * mapSize, mapSize);
      const rgh = sampleMapBilinear(roughness, su * mapSize, sv * mapSize, mapSize)[0] / 255;

      // Perturb sphere normal with tangent-space map (strong relief for thumbs)
      const tnx = (nrm[0] / 255) * 2 - 1;
      const tny = (nrm[1] / 255) * 2 - 1;
      const tnz = (nrm[2] / 255) * 2 - 1;
      nx = nx * 0.42 + tnx * 0.58;
      ny = ny * 0.42 + tny * 0.58;
      nz = nz * 0.42 + Math.max(0.2, tnz) * 0.58;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      nx /= nlen;
      ny /= nlen;
      nz /= nlen;

      const ndotK = Math.max(0, nx * kd[0] + ny * kd[1] + nz * kd[2]);
      const ndotF = Math.max(0, nx * fd[0] + ny * fd[1] + nz * fd[2]);
      const ndotR = Math.max(0, nx * rd[0] + ny * rd[1] + nz * rd[2]);
      const ambient = 0.34;
      const diff = ambient + ndotK * 1.15 + ndotF * 0.48 + ndotR * 0.26;
      // Specular — sharp on glossy (low roughness) faces
      const gloss = Math.pow(1 - rgh, 2.2);
      const hx = kd[0];
      const hy = kd[1] + 1;
      const hz = kd[2];
      const hl = Math.hypot(hx, hy, hz) || 1;
      const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 12 + gloss * 72) * gloss * 1.25;

      const exposure = 1.2;
      out[i] = clamp(alb[0] * diff * exposure + spec * 255);
      out[i + 1] = clamp(alb[1] * diff * exposure + spec * 255);
      out[i + 2] = clamp(alb[2] * diff * exposure + spec * 245);
      out[i + 3] = 255;
    }
  }
  return out;
}

const surfaces = [
  {
    id: 'stone',
    texId: 'tex_hall_stone',
    name: 'Hall Ashlar Stone',
    albedo: stoneAlbedo,
    height: stoneHeight,
    rough: stoneRough,
    strength: 9.5,
  },
  {
    id: 'floor',
    texId: 'tex_hall_floor',
    name: 'Hall Flagstone',
    albedo: floorAlbedo,
    height: floorHeight,
    rough: floorRough,
    strength: 8.5,
  },
  {
    id: 'plaster',
    texId: 'tex_hall_plaster',
    name: 'Hall Plaster',
    albedo: plasterAlbedo,
    height: plasterHeight,
    rough: plasterRough,
    strength: 3.8,
  },
  {
    id: 'wood',
    texId: 'tex_hall_wood',
    name: 'Hall Dark Oak',
    albedo: woodAlbedo,
    height: woodHeight,
    rough: woodRough,
    strength: 6.5,
  },
];

const materials = [
  {
    id: 'mat_hall_stone',
    name: 'Stone Block A',
    surface: 'stone',
    baseColor: '#a8a098',
    roughness: 1,
    metalness: 0.02,
    normalScale: 1.55,
    envMapIntensity: 0.85,
    // uvScale 1 = one texture per meter, matching brushGeometry tiling.
    uvScale: { x: 1, y: 1 },
  },
  {
    id: 'mat_hall_floor',
    name: 'Hall Floor',
    surface: 'floor',
    baseColor: '#8e8478',
    roughness: 1,
    metalness: 0,
    normalScale: 1.4,
    envMapIntensity: 0.9,
    uvScale: { x: 1, y: 1 },
  },
  {
    id: 'mat_hall_ceiling',
    name: 'Hall Ceiling',
    surface: 'plaster',
    baseColor: '#9a9690',
    roughness: 1,
    metalness: 0,
    normalScale: 0.95,
    envMapIntensity: 0.45,
    uvScale: { x: 1, y: 1 },
  },
  {
    id: 'mat_hall_wood',
    name: 'Hall Wood',
    surface: 'wood',
    baseColor: '#6e4a32',
    roughness: 1,
    metalness: 0.05,
    normalScale: 1.35,
    envMapIntensity: 0.95,
    uvScale: { x: 1, y: 1 },
  },
];

const now = Date.now();
const surfaceMaps = {};

for (const s of surfaces) {
  console.log(`generating ${s.id}…`);
  const albedo = fillMap(SIZE, SIZE, (x, y) => s.albedo(x, y));
  const normal = fillMap(SIZE, SIZE, (x, y) =>
    heightToNormal(s.height, x, y, SIZE, SIZE, s.strength),
  );
  const rough = fillMap(SIZE, SIZE, (x, y) => s.rough(x, y));

  const albedoFile = `${s.texId}.png`;
  const normalFile = `${s.texId}_n.png`;
  const roughFile = `${s.texId}_r.png`;

  writePngBuffer(join(texDir, albedoFile), SIZE, SIZE, albedo);
  writePngBuffer(join(texDir, normalFile), SIZE, SIZE, normal);
  writePngBuffer(join(texDir, roughFile), SIZE, SIZE, rough);

  surfaceMaps[s.id] = {
    albedo,
    normal,
    rough,
    albedoId: s.texId,
    normalId: `${s.texId}_n`,
    roughId: `${s.texId}_r`,
    albedoFile,
    normalFile,
    roughFile,
    name: s.name,
  };
  console.log(`  wrote ${albedoFile}, ${normalFile}, ${roughFile}`);
}

for (const m of materials) {
  const maps = surfaceMaps[m.surface];
  const sphere = bakeSphere(maps.albedo, maps.normal, maps.rough, SIZE, SPHERE_SIZE);
  const previewFile = `${m.id}_sphere.png`;
  writePngBuffer(join(previewDir, previewFile), SPHERE_SIZE, SPHERE_SIZE, sphere);

  const def = {
    schemaVersion: 1,
    id: m.id,
    name: m.name,
    type: 'material',
    baseColor: m.baseColor,
    baseColorMapId: maps.albedoId,
    normalMapId: maps.normalId,
    normalScale: m.normalScale ?? 1,
    roughness: m.roughness,
    metalness: m.metalness,
    roughnessMapId: maps.roughId,
    metalnessMapId: null,
    envMapIntensity: m.envMapIntensity ?? 1,
    emissive: '#000000',
    emissiveIntensity: 0,
    emissiveMapId: null,
    opacity: 1,
    transparent: false,
    uvScale: m.uvScale,
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    previewPath: `previews/${previewFile}`,
    createdAt: now,
    updatedAt: now,
  };
  writeFileSync(join(matDir, `${m.id}.json`), `${JSON.stringify(def, null, 2)}\n`);
  console.log(`wrote ${m.id} + sphere preview`);
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const keep = registry.assets.filter(
  (a) =>
    !a.id.startsWith('tex_hall_')
    && !a.id.startsWith('mat_hall_'),
);

for (const s of surfaces) {
  const maps = surfaceMaps[s.id];
  keep.push({
    id: maps.albedoId,
    kind: 'texture',
    name: maps.name,
    folder: 'Textures',
    path: `textures/${maps.albedoFile}`,
    originalName: maps.albedoFile,
    tags: ['hall', 'generated', 'albedo'],
    meta: { width: SIZE, height: SIZE, mapType: 'albedo' },
    createdAt: now,
    updatedAt: now,
  });
  keep.push({
    id: maps.normalId,
    kind: 'texture',
    name: `${maps.name} Normal`,
    folder: 'Textures',
    path: `textures/${maps.normalFile}`,
    originalName: maps.normalFile,
    tags: ['hall', 'generated', 'normal'],
    meta: { width: SIZE, height: SIZE, mapType: 'normal' },
    createdAt: now,
    updatedAt: now,
  });
  keep.push({
    id: maps.roughId,
    kind: 'texture',
    name: `${maps.name} Roughness`,
    folder: 'Textures',
    path: `textures/${maps.roughFile}`,
    originalName: maps.roughFile,
    tags: ['hall', 'generated', 'roughness'],
    meta: { width: SIZE, height: SIZE, mapType: 'roughness' },
    createdAt: now,
    updatedAt: now,
  });
}

for (const m of materials) {
  keep.push({
    id: m.id,
    kind: 'material',
    name: m.name,
    folder: 'Materials',
    path: `materials/${m.id}.json`,
    originalName: `${m.id}.json`,
    tags: ['hall', 'generated', 'pbr'],
    meta: {
      baseColor: m.baseColor,
      hasBaseMap: true,
      hasNormalMap: true,
      hasRoughnessMap: true,
      previewPath: `previews/${m.id}_sphere.png`,
    },
    createdAt: now,
    updatedAt: now,
  });
}

registry.assets = keep;
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log('registry updated, assets:', registry.assets.length);
