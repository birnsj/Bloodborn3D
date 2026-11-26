/**
 * Compatibility shim — Meshy transport is the official CLI (`meshyCli.js`).
 * REST API-key helpers were removed; credentials stay in the CLI store.
 */
export {
  MeshyCliError,
  MeshyApiError,
  defaultStagingRoot,
  validateGlbBuffer,
  detectMeshyCli,
  runMeshy,
  buildImageTo3dCreateArgv,
  dryRunImageTo3d,
  submitImageTo3dAsync,
  getImageTo3dTask,
  downloadImageTo3dTask,
  extractTaskId,
  extractTaskStatus,
  extractBalance,
  startMeshyLogin,
  logoutMeshy,
  getMeshyAuthStatus,
  getMeshyBalance,
  MESHY_CLI_EXIT,
} from './meshyCli.js';
