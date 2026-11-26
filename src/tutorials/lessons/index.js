import { gettingStartedLesson } from './01-getting-started.js';
import { firstRoomLesson } from './02-first-room.js';
import { doorsWindowsLesson } from './03-doors-windows.js';
import { subtractiveGeometryLesson } from './11-subtractive-geometry.js';
import { materialsLesson } from './04-materials.js';
import { lightingLesson } from './05-lighting.js';
import { furnishingLesson } from './06-furnishing.js';
import { organizingLesson } from './07-organizing.js';
import { prefabsLesson } from './08-prefabs.js';
import { testingLesson } from './09-testing.js';
import { workspaceLesson } from './10-workspace.js';
import { ceilingsMultilevelLesson } from './12-ceilings-multilevel.js';
import { rampsStairsLesson } from './13-ramps-stairs.js';
import { geometryEditingLesson } from './14-geometry-editing.js';
import { surfaceAlignLesson } from './15-surface-align.js';
import { columnsArchesCurvesLesson } from './16-columns-arches-curves.js';
import { projectArtLibraryLesson } from './17-project-art-library.js';
import { assetGenerationLesson } from './18-asset-generation.js';
import { postProcessingLesson } from './19-post-processing.js';
import { worldFogAtmosphereLesson } from './20-world-fog-atmosphere.js';
import { worldEnvironmentLesson } from './21-world-environment.js';
import { materialsShadingLesson } from './22-materials-shading.js';
import { lightingAdvancedLesson } from './23-lighting-advanced.js';

export const LESSONS = [
  gettingStartedLesson,
  firstRoomLesson,
  doorsWindowsLesson,
  subtractiveGeometryLesson,
  materialsLesson,
  lightingLesson,
  furnishingLesson,
  organizingLesson,
  prefabsLesson,
  testingLesson,
  workspaceLesson,
  ceilingsMultilevelLesson,
  rampsStairsLesson,
  geometryEditingLesson,
  surfaceAlignLesson,
  columnsArchesCurvesLesson,
  projectArtLibraryLesson,
  assetGenerationLesson,
  postProcessingLesson,
  worldFogAtmosphereLesson,
  worldEnvironmentLesson,
  materialsShadingLesson,
  lightingAdvancedLesson,
].sort((a, b) => (a.order || 0) - (b.order || 0));

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}

export function listLessons() {
  return LESSONS.map(({ id, title, summary, order, starterPath }) => ({
    id,
    title,
    summary,
    order,
    starterPath,
  }));
}
