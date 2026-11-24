/**
 * Convex-brush geometry limits and epsilons (Phase 2F.0).
 * All distances / volumes are in editor units (eu).
 */

export const MAX_VERTICES = 64;
export const MAX_FACES = 64;

/** Discard / reject edges shorter than this (matches brushBoolean MIN_SOLID_SIZE). */
export const MIN_EDGE = 0.5;
export const MIN_FACE_AREA = 0.25;
export const MIN_VOLUME = 1;
export const MIN_THICKNESS = 0.5;

/** Planarity / convexity / coplanar-merge tolerances. */
export const PLANAR_EPS = 0.01;
export const CONVEX_EPS = 0.01;
export const COPLANAR_DIST_EPS = 0.01;
/** Cosine of ~0.1° — normals closer than this are treated as coplanar. */
export const COPLANAR_NORMAL_DOT = Math.cos((0.1 * Math.PI) / 180);

/** Coordinate clamp / sanity. */
export const MAX_COORD = 1e5;
/** Canonical serialization rounding (eu). */
export const COORD_ROUND = 1e4; // round to 1e-4

/** Face-ID grammar: legacy box ids + fN. */
export const FACE_ID_RE = /^[a-z][a-z0-9_]{0,15}$/;

export const GEOMETRY_VERSION = 1;
