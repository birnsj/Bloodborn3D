// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { snapToGrid } from '../../core/units.js';
import { AddActorsCommand, ReplaceActorsCommand, SetPrefabOverridesCommand } from '../history/commands.js';
import { stampAuthoringLayer, assignAuthoringLayer, getActiveAuthoringLayerId } from '../authoringLayerStamp.js';
import { createStaticMeshActor } from '../meshFactory.js';
import { createLightActor } from '../lightFactory.js';
import { createEnvironmentActor } from '../environmentFactory.js';
import { createPrimitiveMeshActor } from '../primitiveMeshFactory.js';
import { createPlayerSpawnActor } from '../spawnFactory.js';
import { findAsset } from '../../assets/AssetRegistry.js';
import { createPrefabFromActors, instantiatePrefab, syncPrefabInstances, unpackPrefabInstance, getInstanceActors, findInstanceRoot, clearOverride, recordActorPrefabOverride, getOverrides as getPrefabOverrides } from '../../prefabs/prefabOps.js';
import { Actor } from '../../core/Actor.js';
import { createComponentFromJSON } from '../../components/componentRegistry.js';

export function usePlacementAndPrefabs({
  assetRegistry,
  bump,
  executeCommand,
  getPrefabDefinition,
  getPrefabDefinitionSync,
  gridRef,
  gridSnapRef,
  mode,
  notify,
  rejectIfActiveLayerLocked,
  savePrefabDefinition,
  selectedRef,
  world,
}) {
const placeMeshAsset = useCallback((asset, position, options = {}) => {
    if (!world || mode === 'play' || !asset?.id) return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    // Prefer live registry meta so Asset Viewer pivot Apply is inherited even if
    // the caller still holds a stale asset object from before the meta patch.
    const live = findAsset(assetRegistry, asset.id);
    const metaOffset = live?.meta?.defaultContentOffset ?? asset?.meta?.defaultContentOffset;
    const actor = createStaticMeshActor({
      assetId: asset.id,
      name: asset.name || live?.name || 'Static Mesh',
      position: position || { x: 0, y: 50, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? false,
      collidable: options.collidable,
      collisionType: options.collisionType,
      contentOffset: options.contentOffset ?? metaOffset ?? null,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: 'Place mesh',
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand, assetRegistry]);

  const placeLight = useCallback((lightType = 'point', position, options = {}) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createLightActor({
      lightType,
      position: position || { x: 0, y: 200, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? snap,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${lightType} light`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placeEnvironment = useCallback((envType = 'water2', position, options = {}) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createEnvironmentActor({
      envType,
      position: position || { x: 0, y: 0, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? snap,
      targetActorId: options.targetActorId,
      mapId: options.mapId,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${envType}`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placePrimitiveMesh = useCallback((primitive = 'box', position, options = {}) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    let actor;
    try {
      actor = createPrimitiveMeshActor({
        primitive,
        position: position || { x: 0, y: 0, z: 0 },
        rotation: options.rotation,
        gridSize: g,
        snapY: options.snapY ?? snap,
        materialId: options.materialId,
      });
    } catch (err) {
      console.warn('[BloodBound] place primitive failed', err);
      return null;
    }
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${primitive}`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placePlayerSpawn = useCallback((position, options = {}) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createPlayerSpawnActor({
      position: position || { x: 0, y: 0, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? false,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: 'Place player spawn',
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const createPrefabFromSelection = useCallback(async (name = 'Prefab') => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) {
      notify('Select actors or a cell to create a prefab');
      return null;
    }
    const result = createPrefabFromActors(world, selectedRef.current, {
      name,
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    if (!result.ok) {
      notify(result.error || 'Prefab create failed');
      return null;
    }
    try {
      const saved = await savePrefabDefinition(result.definition);
      notify(`Created prefab ${saved.asset.name}`);
      return saved;
    } catch (err) {
      notify(err.message);
      return null;
    }
  }, [world, mode, savePrefabDefinition, getPrefabDefinitionSync, notify]);

  const placePrefabAsset = useCallback(async (assetOrId, position, options = {}) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('place')) return null;
    const id = typeof assetOrId === 'string' ? assetOrId : assetOrId?.id;
    if (!id) return null;
    let definition = getPrefabDefinitionSync(id);
    if (!definition) {
      definition = await getPrefabDefinition(id);
    }
    if (!definition) {
      notify(`Prefab not found: ${id}`);
      return null;
    }
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const raw = {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
    };
    const pos = {
      x: snap ? snapToGrid(raw.x, g) : raw.x,
      // Preserve surface elevation unless caller asks to snap Y.
      y: (options.snapY && snap) ? snapToGrid(raw.y, g) : raw.y,
      z: snap ? snapToGrid(raw.z, g) : raw.z,
    };
    const placed = instantiatePrefab(definition, world, { position: pos });
    // Prefabs must not depend on map-specific layer IDs — assign active layer on place.
    const activeLayer = getActiveAuthoringLayerId(world);
    assignAuthoringLayer(placed.actors, activeLayer);
    // instantiate already added actors — capture JSON then remove so command owns add
    const actorsJson = placed.actors.map((a) => a.toJSON());
    for (const a of placed.actors) {
      world.removeActor(a.id);
    }
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson,
        label: `Place prefab ${definition.name}`,
      }),
      { selectIds: placed.rootActorIds },
    );
    return placed;
  }, [world, mode, executeCommand, getPrefabDefinition, getPrefabDefinitionSync, notify]);

  const applyPrefabSourceUpdate = useCallback(async (prefabId) => {
    if (!world || mode === 'play' || !prefabId) return;
    let definition = getPrefabDefinitionSync(prefabId);
    if (!definition) definition = await getPrefabDefinition(prefabId);
    if (!definition) {
      notify(`Prefab not found: ${prefabId}`);
      return;
    }
    // Ensure nested sources are loaded so parent sync can re-apply nested updates.
    for (const nestedId of definition.nestedPrefabIds || []) {
      if (!getPrefabDefinitionSync(nestedId)) {
        await getPrefabDefinition(nestedId);
      }
    }
    const beforeJson = world.actors.map((a) => a.toJSON());
    syncPrefabInstances(world, definition, {
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    const afterJson = world.actors.map((a) => a.toJSON());
    // Revert to before so history command owns the mutation
    world.clear();
    for (const data of beforeJson) {
      world.addActor(Actor.fromJSON(data, createComponentFromJSON));
    }
    executeCommand(
      new ReplaceActorsCommand({
        world,
        beforeJson,
        afterJson,
        label: `Sync prefab ${definition.name}`,
      }),
      { resync: true },
    );
  }, [world, mode, executeCommand, getPrefabDefinition, getPrefabDefinitionSync, notify]);

  const updatePrefabAssetFromSelection = useCallback(async () => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return null;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const prefabId = actor?.prefab?.prefabId || actor?.prefab?.ownerPrefabId;
    if (!prefabId) {
      notify('Selection is not a prefab instance');
      return null;
    }
    const root = findInstanceRoot(world, actor.prefab.instanceId)
      || findInstanceRoot(world, actor.prefab.ownerInstanceId);
    const instanceId = root?.prefab?.instanceId || actor.prefab.instanceId;
    const members = getInstanceActors(world, instanceId);
    const ids = members.length ? members.map((m) => m.id) : selectedRef.current;
    const existing = getPrefabDefinitionSync(prefabId);
    const result = createPrefabFromActors(world, ids, {
      id: prefabId,
      name: existing?.name || actor.name || 'Prefab',
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    if (!result.ok) {
      notify(result.error || 'Update prefab failed');
      return null;
    }
    try {
      const saved = await savePrefabDefinition(result.definition);
      // Propagate to other instances
      await applyPrefabSourceUpdate(prefabId);
      notify(`Updated prefab ${saved.asset.name}`);
      return saved;
    } catch (err) {
      notify(err.message);
      return null;
    }
  }, [
    world,
    mode,
    savePrefabDefinition,
    getPrefabDefinitionSync,
    applyPrefabSourceUpdate,
    notify,
  ]);

  const unpackSelectedPrefab = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const instanceId = actor?.prefab?.instanceId;
    if (!instanceId) {
      notify('Selection is not a prefab instance');
      return;
    }
    const beforeJson = getInstanceActors(world, instanceId).map((a) => a.toJSON());
    unpackPrefabInstance(world, instanceId);
    const afterJson = beforeJson.map((a) => {
      const live = world.getActor(a.id);
      return live ? live.toJSON() : a;
    });
    // Revert prefab fields for command
    for (const data of beforeJson) {
      const live = world.getActor(data.id);
      if (live) live.prefab = data.prefab ? structuredClone(data.prefab) : null;
    }
    executeCommand(
      new ReplaceActorsCommand({
        world,
        beforeJson,
        afterJson,
        label: 'Unpack prefab',
      }),
      { resync: true },
    );
  }, [world, mode, executeCommand, notify]);

  const recordSelectedPrefabOverride = useCallback(async () => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    if (!actor?.prefab?.templateId || !actor.prefab.instanceId) return;
    const root = findInstanceRoot(world, actor.prefab.instanceId);
    if (!root) return;
    const before = getPrefabOverrides(root);
    const result = await recordActorPrefabOverride(world, actor, null, {
      getDefinitionSync: getPrefabDefinitionSync,
      getDefinition: getPrefabDefinition,
    });
    if (!result?.ok) {
      notify(result?.error || 'Prefab source not available');
      return;
    }
    const after = getPrefabOverrides(root);
    root.prefab.overrides = before;
    executeCommand(
      new SetPrefabOverridesCommand({
        world,
        actorId: root.id,
        before,
        after,
        label: 'Record prefab override',
      }),
      { resync: false },
    );
    bump();
  }, [world, mode, executeCommand, getPrefabDefinitionSync, getPrefabDefinition, bump, notify]);

  const revertSelectedPrefabOverride = useCallback(async (path = null) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    if (!actor?.prefab) return;
    const root = findInstanceRoot(world, actor.prefab.instanceId);
    if (!root) return;
    const before = getPrefabOverrides(root);
    clearOverride(root, actor.prefab.templateId, path);
    const after = getPrefabOverrides(root);
    root.prefab.overrides = before;
    executeCommand(
      new SetPrefabOverridesCommand({
        world,
        actorId: root.id,
        before,
        after,
        label: 'Revert prefab override',
      }),
      { resync: false },
    );
    // Re-apply source for this actor property by syncing instance
    const prefabId = actor.prefab.prefabId;
    await applyPrefabSourceUpdate(prefabId);
  }, [world, mode, executeCommand, applyPrefabSourceUpdate]);

  return {
    applyPrefabSourceUpdate,
    createPrefabFromSelection,
    placeEnvironment,
    placeLight,
    placeMeshAsset,
    placePlayerSpawn,
    placePrefabAsset,
    placePrimitiveMesh,
    recordSelectedPrefabOverride,
    revertSelectedPrefabOverride,
    unpackSelectedPrefab,
    updatePrefabAssetFromSelection,
  };
}
