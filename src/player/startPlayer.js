/**
 * Standalone player: loads a level JSON and plays it with the shared runtime, without the editor.
 * Reuses GameRuntime / SceneView / PhysicsWorld / PlayerController unchanged, so Play here behaves
 * the same as Play-in-Editor. Must never import from src/editor, src/ui or src/tutorials (see
 * architectureBoundaries.test.js).
 */
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { GameRuntime } from '../runtime/GameRuntime.js';
import { createStaticAssetResolver, defaultFetchJson } from './createStaticAssetResolver.js';

/** Level files are static under /levels/<name>.json (public/levels). */
export function levelUrlFor(name) {
  return `/levels/${encodeURIComponent(name)}.json`;
}

/**
 * @param {{ canvas: HTMLCanvasElement, levelName: string, fetchJson?: Function }} options
 * @returns {Promise<GameRuntime>} a runtime that is already in play mode
 */
export async function startPlayer({ canvas, levelName, fetchJson = defaultFetchJson }) {
  const [levelData, assets] = await Promise.all([
    fetchJson(levelUrlFor(levelName)),
    createStaticAssetResolver({ fetchJson }),
  ]);
  // Throws with a specific message for unsupported schema versions or invalid geometry.
  const world = deserializeLevel(levelData);

  const runtime = new GameRuntime({ canvas });
  // Resolver first: setAssetResolver re-syncs an existing world, so set it before the world.
  runtime.setAssetResolver(assets);
  runtime.setWorld(world);
  runtime.setSize(window.innerWidth, window.innerHeight);
  await runtime.play();
  return runtime;
}
