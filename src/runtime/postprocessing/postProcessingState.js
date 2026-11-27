/**
 * Compatibility re-export — PP normalization lives in core (engine-neutral schema).
 * Prefer importing from `src/core/postprocessing/postProcessingState.js`.
 * Three.js / pmndrs EffectComposer wiring remains in PostProcessingController.
 */
export * from '../../core/postprocessing/postProcessingState.js';
