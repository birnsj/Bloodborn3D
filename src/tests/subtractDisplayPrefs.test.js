import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { LightComponent } from '../components/LightComponent.js';
import { SceneView } from '../runtime/SceneView.js';
import {
  clampEditorSettings,
  DEFAULT_EDITOR_SETTINGS,
} from '../editor/editorSettingsPrefs.js';

function makeView() {
  const view = Object.create(SceneView.prototype);
  view._syncToken = 1;
  view._actorMeshes = new Map();
  view._actorEpochHighWater = new Map();
  view.selectedActorIds = [];
  view.selectedSurface = null;
  view.geometrySelection = null;
  view.editMode = true;
  view.gridSize = 25;
  view.maxAnisotropy = 8;
  view.root = new THREE.Group();
  view.viewportColors = { subtract: 0xc23b4a, selection: 0xffaa33 };
  view.subtractFillVisible = true;
  view.subtractFillOpacity = 0.14;
  view._sharedCutterMaterials = null;
  view.syncStats = {
    fullSyncs: 0, incrementalSyncs: 0, actorAdds: 0, actorRemoves: 0, actorRebuilds: 0,
    transformUpdates: 0, hierarchyMoves: 0, geometryAllocs: 0, materialAllocs: 0,
  };
  view.assetResolver = {
    getMaterialDefinition: () => ({ id: 'default', baseColor: '#808080' }),
    getTextureUrl: () => null,
  };
  view.applyWorldAmbient = () => {};
  view.setSelection = vi.fn();
  view._syncAmbientFromWorld = () => {};
  view._syncSceneFromWorld = () => {};
  view._syncRendererFromWorld = () => {};
  view.applyEditorVisibilityFilters = () => {};
  view._syncActorHierarchy = () => {};
  view._stampActorVisual = SceneView.prototype._stampActorVisual;
  view._addActorVisual = SceneView.prototype._addActorVisual;
  view._populateActorComponents = SceneView.prototype._populateActorComponents;
  view._addBrushVisual = SceneView.prototype._addBrushVisual;
  view._getSharedCutterMaterials = SceneView.prototype._getSharedCutterMaterials;
  view.setSubtractDisplay = SceneView.prototype.setSubtractDisplay;
  view._applySubtractDisplayToMeshes = SceneView.prototype._applySubtractDisplayToMeshes;
  view._applySubtractColorsToMeshes = SceneView.prototype._applySubtractColorsToMeshes;
  view.setLightHelpersVisible = SceneView.prototype.setLightHelpersVisible;
  view._applyLightHelpersVisibility = SceneView.prototype._applyLightHelpersVisibility;
  view._addLightVisual = SceneView.prototype._addLightVisual;
  view._createLightGizmo = SceneView.prototype._createLightGizmo;
  view.lightHelpersVisible = true;
  view.syncFromWorld = function syncFromWorld(world) {
    this.world = world;
    this.clearWorldMeshes?.();
    for (const actor of world.actors) this._addActorVisual(actor, this._syncToken, world);
  };
  view.clearWorldMeshes = function clearWorldMeshes() {
    for (const entry of this._actorMeshes.values()) {
      entry.group?.parent?.remove(entry.group);
    }
    this._actorMeshes.clear();
  };
  view.dispose = () => {
    view._sharedCutterMaterials?.fill?.dispose?.();
    view._sharedCutterMaterials?.line?.dispose?.();
  };
  return view;
}

describe('subtract display prefs (fill hide + opacity, solid edges)', () => {
  /** @type {ReturnType<typeof makeView>|null} */
  let view = null;

  afterEach(() => {
    view?.dispose?.();
    view = null;
  });

  it('defaults show subtract fill with low opacity in editor settings', () => {
    expect(DEFAULT_EDITOR_SETTINGS.showSubtractVolumes).toBe(true);
    expect(DEFAULT_EDITOR_SETTINGS.subtractVolumeOpacity).toBe(0.14);
    expect(DEFAULT_EDITOR_SETTINGS.showLightHelpers).toBe(true);
    expect(clampEditorSettings({ subtractVolumeOpacity: 4 }).subtractVolumeOpacity).toBe(1);
  });

  it('hides fill meshes but keeps edge lines solid and visible', () => {
    view = makeView();
    const world = new World({ name: 'SubtractDisplay', schemaVersion: 2, mapMode: 'subtractive' });
    const cutter = new Actor({ id: 'cut', name: 'Cutter' });
    cutter.addComponent(new BrushComponent({
      size: { x: 100, y: 100, z: 100 },
      operation: 'subtract',
      collidable: false,
    }));
    world.addActor(cutter);
    view.syncFromWorld(world);

    const group = view._actorMeshes.get(cutter.id)?.group;
    expect(group).toBeTruthy();
    const fill = [];
    const edges = [];
    group.traverse((obj) => {
      if (obj.userData?.brushOperation === 'subtract') fill.push(obj);
      if (obj.userData?.brushOperation === 'subtract-edges') edges.push(obj);
    });
    expect(fill.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);

    view.setSubtractDisplay({ visible: false, opacity: 0.5 });
    for (const mesh of fill) {
      expect(mesh.visible).toBe(false);
      expect(mesh.material.opacity).toBe(0.5);
    }
    for (const line of edges) {
      expect(line.visible).toBe(true);
      expect(line.material.opacity).toBe(1);
      expect(line.material.transparent).toBe(false);
    }

    view.setSubtractDisplay({ visible: true, opacity: 0.2 });
    for (const mesh of fill) {
      expect(mesh.visible).toBe(true);
      expect(mesh.material.opacity).toBe(0.2);
    }
    for (const line of edges) {
      expect(line.visible).toBe(true);
      expect(line.material.opacity).toBe(1);
    }
  });

  it('hides light gizmos without removing the light holder', () => {
    view = makeView();
    view._finishLightVisual = async () => {};
    const world = new World({ name: 'LightHelpers', schemaVersion: 2 });
    const lamp = new Actor({ id: 'lamp', name: 'Point Light' });
    lamp.addComponent(new LightComponent({ lightType: 'point', color: '#ffffff' }));
    world.addActor(lamp);

    const group = new THREE.Group();
    view._actorMeshes.set(lamp.id, { group, visualEpoch: 1, actor: lamp });
    view.root.add(group);
    view._addLightVisual(group, lamp, lamp.getComponent('Light'), 1, world);

    const gizmos = [];
    const holders = [];
    group.traverse((obj) => {
      if (obj.userData?.bbLightGizmo) gizmos.push(obj);
      if (obj.userData?.bbLightHolder) holders.push(obj);
    });
    expect(gizmos.length).toBeGreaterThan(0);
    expect(holders.length).toBeGreaterThan(0);

    view.setLightHelpersVisible(false);
    for (const gizmo of gizmos) expect(gizmo.visible).toBe(false);
    for (const holder of holders) expect(holder.visible).toBe(true);

    view.setLightHelpersVisible(true);
    for (const gizmo of gizmos) expect(gizmo.visible).toBe(true);
  });
});
