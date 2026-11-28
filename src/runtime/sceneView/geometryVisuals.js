// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { FACE_KEYS } from '../../materials/MaterialDefinition.js';
import { createBrushBoxGeometry, createBrushSolidGeometry, createBatchedWorldSolidGeometry, createExposedWorldSolidGeometry, getBrushRenderSolids } from '../brushGeometry.js';
import { isCutterMaterialSharingEnabled, isWorldSolidBatchingEnabled } from '../renderExperiments.js';
import { isSubtractBrush, isWorldSolidActor } from '../brushBoolean.js';
import { createRampWedgeGeometry } from '../rampGeometry.js';
import { createStairGeometry } from '../stairGeometry.js';
import { createColumnGeometry } from '../columnGeometry.js';
import { createArchGeometry } from '../archGeometry.js';
import { createCurvedWallGeometry } from '../curvedWallGeometry.js';
import { brushHasMiters, createMiteredWallGeometry } from '../miteredWallGeometry.js';
import { createConvexBrushGeometry } from '../convexBrushGeometry.js';
import { createThreeMaterial, createFallbackBrushMaterial, assetUrl } from '../materialFactory.js';
import { inspectGeometryUvChannels } from '../../assets/textureUvChannels.js';
import { BOX_SURFACE_IDS, resolveSurfaceMaterialId } from '../surfaces.js';
import { markSharedGpuResource } from '../gpuResources.js';
import { disposeMaterial, darkenHex } from './shared.js';

export class GeometryVisualMethods {
  _addConvexBrushVisual(group, actor, comp, syncToken) {
    if (!comp?.geometry) {
      if (this.editMode) {
        const ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)),
          new THREE.LineBasicMaterial({ color: 0xaa3344, transparent: true, opacity: 0.7 }),
        );
        ghost.userData.actorId = actor.id;
        ghost.userData.pickable = true;
        ghost.userData.editorOnly = true;
        ghost.userData.convexInvalid = true;
        group.add(ghost);
      }
      return;
    }

    const geom = createConvexBrushGeometry(comp);
    if (!geom) return;

    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || [];
    const mats = surfaceIds.map(() => fallback.clone());
    const mesh = new THREE.Mesh(geom, mats.length ? mats : fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.convexBrush = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addBrushVisual(group, actor, comp, syncToken) {
    // Subtractive volumes: translucent crimson wireframe in Edit only — never solid, never Play.
    if (isSubtractBrush(comp)) {
      if (!this.editMode) return;
      const geom = new THREE.BoxGeometry(
        toMeters(comp.size.x),
        toMeters(comp.size.y),
        toMeters(comp.size.z),
      );
      const subtractColor = this.viewportColors.subtract;
      const shared = isCutterMaterialSharingEnabled() ? this._getSharedCutterMaterials() : null;
      const fillOpacity = Number.isFinite(this.subtractFillOpacity)
        ? this.subtractFillOpacity
        : 0.14;
      const mat = shared?.fill || new THREE.MeshBasicMaterial({
        color: subtractColor,
        transparent: true,
        opacity: fillOpacity,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        // Pull the translucent volume slightly toward the camera so it does not
        // z-fight against coplanar carved faces (same trick as surface highlight).
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      if (shared?.fill) {
        shared.fill.opacity = fillOpacity;
        shared.fill.transparent = true;
      }
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 2;
      mesh.visible = this.subtractFillVisible !== false;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.editorOnly = true;
      mesh.userData.brushOperation = 'subtract';
      group.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        shared?.line || new THREE.LineBasicMaterial({ color: subtractColor }),
      );
      edges.renderOrder = 3;
      edges.visible = true;
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      edges.userData.brushOperation = 'subtract-edges';
      group.add(edges);
      return;
    }

    const world = actor.world || null;
    // Mitered walls without openings: single prism mesh (keeps clean angled junctions).
    // Openings keep the AABB solid path; miters are ignored while openings exist.
    if (
      brushHasMiters(comp)
      && !(comp.openings?.length)
      && actor.tags?.includes?.('wall')
    ) {
      const geom = createMiteredWallGeometry(
        comp.size,
        comp.uv,
        comp.miterStart,
        comp.miterEnd,
        comp.faceUVs,
      );
      const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
        editMode: this.editMode,
      });
      const surfaceIds = geom.userData.surfaceIds || [...BOX_SURFACE_IDS];
      const mats = surfaceIds.map(() => fallback.clone());
      const mesh = new THREE.Mesh(geom, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.miteredWall = true;
      mesh.userData.surfaceScheme = 'grouped';
      mesh.userData.surfaceIds = surfaceIds;
      group.add(mesh);
      if (this.editMode) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        group.add(edges);
      }
      void this._applySurfaceMaterials(mesh, comp, syncToken);
      return;
    }

    const { solids } = getBrushRenderSolids(comp, world ? { world, actor } : null);

    // Fully carved brush: keep an editor-only ghost so it remains selectable.
    if (!solids.length) {
      if (this.editMode) {
        const geom = new THREE.BoxGeometry(
          toMeters(comp.size.x),
          toMeters(comp.size.y),
          toMeters(comp.size.z),
        );
        const ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.45 }),
        );
        ghost.userData.actorId = actor.id;
        ghost.userData.pickable = true;
        ghost.userData.editorOnly = true;
        group.add(ghost);
        geom.dispose();
      }
      return;
    }

    const hideOuterHull = isWorldSolidActor(actor);
    let anyVisibleFace = false;

    // Phase 2G: batched World Solid (default ON). Legacy per-solid path remains
    // for opt-out harnesses and still uses grouped face picking/UVs.
    const batched = hideOuterHull && isWorldSolidBatchingEnabled();
    if (batched) {
      anyVisibleFace = this._addBatchedWorldSolidMesh(group, actor, comp, solids, syncToken);
    }

    for (const solid of (batched ? [] : solids)) {
      // Brush-local min corner so cut pieces share continuous world-aligned UVs.
      const bias = {
        origin: {
          x: solid.center.x - solid.size.x * 0.5,
          y: solid.center.y - solid.size.y * 0.5,
          z: solid.center.z - solid.size.z * 0.5,
        },
      };
      // Subtractive World Solid: clip faces to empty-adjacent patches only.
      // Additive brushes keep full solid boxes (unchanged).
      let geom;
      if (hideOuterHull) {
        geom = createExposedWorldSolidGeometry(
          solid,
          solids,
          comp.size,
          comp.uv,
          bias,
          comp.faceUVs,
        );
        if (!geom) continue;
      } else if (solids.length === 1 && solid.role === 'solid') {
        geom = createBrushBoxGeometry(solid.size, comp.uv, comp.faceUVs);
      } else {
        geom = createBrushSolidGeometry(solid.size, comp.uv, bias, comp.faceUVs);
      }

      // Cut pieces inherit brush materials; slightly darker fallback for newly exposed faces.
      const baseColor = solid.role === 'cut' && !comp.materialId
        ? darkenHex(comp.color || '#888888', 0.12)
        : (comp.color || '#888888');
      const fallback = createFallbackBrushMaterial(baseColor, {
        editMode: this.editMode,
      });
      // Exposed World Solid patches have variable quads per face — use grouped
      // scheme (geometry already stamps per-quad surfaceIds). Intact BoxGeometry
      // solids keep the classic 2-triangles-per-face 'box' scheme.
      const surfaceIds = hideOuterHull
        ? (geom.userData?.surfaceIds ? [...geom.userData.surfaceIds] : [...BOX_SURFACE_IDS])
        : [...BOX_SURFACE_IDS];
      const mats = surfaceIds.map((_, i) => (i === 0 ? fallback : fallback.clone()));
      const mesh = new THREE.Mesh(geom, mats);
      mesh.position.set(
        toMeters(solid.center.x),
        toMeters(solid.center.y),
        toMeters(solid.center.z),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.brushSolid = solid.role;
      if (hideOuterHull) {
        mesh.userData.surfaceScheme = 'grouped';
        mesh.userData.surfaceIds = surfaceIds;
        mesh.userData.substrateMesh = true;
        anyVisibleFace = true;
      } else {
        mesh.userData.surfaceScheme = 'box';
        mesh.userData.surfaceIds = surfaceIds;
        anyVisibleFace = true;
      }

      group.add(mesh);

      if (this.editMode && !hideOuterHull) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.position.copy(mesh.position);
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        group.add(edges);
      }

      void this._applyBrushMaterials(mesh, comp, syncToken);
    }

    // Substrate outline so World Solid stays findable when its hull is hidden.
    if (hideOuterHull && this.editMode) {
      const ghostGeom = new THREE.BoxGeometry(
        toMeters(comp.size.x),
        toMeters(comp.size.y),
        toMeters(comp.size.z),
      );
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(ghostGeom),
        new THREE.LineBasicMaterial({
          color: anyVisibleFace ? 0x4a5560 : 0x667788,
          transparent: true,
          opacity: anyVisibleFace ? 0.35 : 0.55,
        }),
      );
      ghost.userData.actorId = actor.id;
      ghost.userData.pickable = true;
      ghost.userData.editorOnly = true;
      ghost.userData.worldSolidGhost = true;
      group.add(ghost);
      ghostGeom.dispose();
    }
  }

  /**
   * Shared cutter wireframe materials (default ON). Marked shared so per-actor
   * teardown skips them; SceneView.dispose() frees them.
   */
  _getSharedCutterMaterials() {
    const color = this.viewportColors.subtract;
    if (!this._sharedCutterMaterials) {
      this._sharedCutterMaterials = {
        fill: markSharedGpuResource(new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: Number.isFinite(this.subtractFillOpacity) ? this.subtractFillOpacity : 0.14,
          depthWrite: false,
          depthTest: true,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })),
        line: markSharedGpuResource(new THREE.LineBasicMaterial({ color })),
      };
    }
    this._sharedCutterMaterials.fill.color.setHex(color);
    this._sharedCutterMaterials.fill.opacity = Number.isFinite(this.subtractFillOpacity)
      ? this.subtractFillOpacity
      : 0.14;
    this._sharedCutterMaterials.line.color.setHex(color);
    this._sharedCutterMaterials.line.opacity = 1;
    this._sharedCutterMaterials.line.transparent = false;
    return this._sharedCutterMaterials;
  }

  /**
   * Batched World Solid visual: one mesh with one material slot per exposed panel
   * (`pz#0`, …). Picking / highlight / Face Texture target that panel; legacy
   * face keys in faceMaterials still tint every panel on that axis. The actor
   * group owns the mesh; the normal rebuild path disposes it.
   * @returns {boolean} whether anything was drawn
   */
  _addBatchedWorldSolidMesh(group, actor, comp, solids, syncToken) {
    const geom = createBatchedWorldSolidGeometry(solids, comp.size, comp.uv, comp.faceUVs);
    if (!geom) return false;

    // Surviving World Solid pieces are carve products (role 'cut'); keep the same
    // fallback tint as the per-solid path when no material is assigned.
    const baseColor = comp.materialId
      ? (comp.color || '#888888')
      : darkenHex(comp.color || '#888888', 0.12);
    const fallback = createFallbackBrushMaterial(baseColor, { editMode: this.editMode });
    // Per-quad ids from createBatchedWorldSolidGeometry — one material slot per panel
    // so surface highlight / Face Texture only affect the clicked wall.
    const surfaceIds = geom.userData?.surfaceIds?.length
      ? [...geom.userData.surfaceIds]
      : [...BOX_SURFACE_IDS];
    const mats = surfaceIds.map((_, i) => (i === 0 ? fallback : fallback.clone()));
    const mesh = new THREE.Mesh(geom, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.substrateMesh = true;
    mesh.userData.batchedWorldSolid = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);
    void this._applySurfaceMaterials(mesh, comp, syncToken);
    return true;
  }

  /** Hide materials for World Solid faces that still sit on the outer brush hull. */
  _applyHiddenHullFaces(mesh) {
    const hull = mesh?.userData?.hideHullFaces;
    if (!hull || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < FACE_KEYS.length; i += 1) {
      const mat = mats[i];
      if (!mat) continue;
      const hide = Boolean(hull[FACE_KEYS[i]]);
      mat.visible = !hide;
      if (hide) {
        mat.colorWrite = false;
        mat.depthWrite = false;
      }
    }
  }

  _addStairVisual(group, actor, comp, syncToken) {
    const steps = createStairGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    /** @type {import('three').Mesh[]} */
    const stepMeshes = [];
    steps.traverse((child) => {
      if (!child.isMesh) return;
      const surfaceIds = child.geometry.userData.surfaceIds || [...BOX_SURFACE_IDS];
      const isBox = !child.geometry.userData.surfaceIds;
      // Per-mesh fallback clones until shared materials are applied (F18).
      child.material = surfaceIds.map(() => fallback.clone());
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.actorId = actor.id;
      child.userData.pickable = true;
      child.userData.stair = true;
      child.userData.surfaceScheme = isBox ? 'box' : 'grouped';
      child.userData.surfaceIds = surfaceIds;
      if (this.editMode) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        child.add(edges);
      }
      stepMeshes.push(child);
    });
    group.add(steps);
    // Resolve materials once, then share instances across steps (draw/state win; editing intact).
    void this._applySharedStairMaterials(stepMeshes, comp, syncToken);
  }

  /**
   * Stair steps share one material instance per surface slot (F18). Per-surface
   * materialId / faceMaterials / UVs / picking / collision stay on the Stair component
   * and step geometry; only GPU material objects are deduped within the actor.
   */
  async _applySharedStairMaterials(stepMeshes, comp, syncToken) {
    if (!stepMeshes?.length) return;
    const primary = stepMeshes[0];
    await this._applySurfaceMaterials(primary, comp, syncToken);
    const actorId = primary.userData?.actorId;
    const visualEpoch = primary.userData?.visualEpoch;
    if (!this._isActorVisualCurrent(actorId, syncToken, visualEpoch)) return;

    const shared = primary.material;
    if (!shared) return;
    const sharedList = Array.isArray(shared) ? shared : [shared];
    const keep = new Set(sharedList);

    for (let i = 1; i < stepMeshes.length; i += 1) {
      const mesh = stepMeshes[i];
      if (!this._isActorVisualCurrent(mesh.userData?.actorId, syncToken, mesh.userData?.visualEpoch)) {
        return;
      }
      const prev = mesh.material;
      mesh.material = Array.isArray(shared) ? shared.slice() : shared;
      if (Array.isArray(prev)) {
        for (const m of prev) {
          if (m && !keep.has(m)) disposeMaterial(m);
        }
      } else if (prev && !keep.has(prev)) {
        disposeMaterial(prev);
      }
      if (mesh.material) mesh.material.needsUpdate = true;
    }
  }

  _addRampVisual(group, actor, comp, syncToken) {
    const geom = createRampWedgeGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['slope'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.ramp = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addColumnVisual(group, actor, comp, syncToken) {
    const geom = createColumnGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9098', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['shaft'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.column = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 24),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addArchVisual(group, actor, comp, syncToken) {
    const geom = createArchGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['outer'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.arch = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 20),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  async _applySimpleParamMaterial(mesh, comp, syncToken) {
    return this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addCurvedWallVisual(group, actor, comp, syncToken) {
    const geom = createCurvedWallGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['outer'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.curvedWall = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 24),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  async _applyRampMaterial(mesh, comp, syncToken) {
    return this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  /**
   * Apply actor materialId + faceMaterials overrides onto a multi-material mesh.
   * surfaceIds come from mesh.userData (semantic IDs, not triangle indices).
   */
  async _applySurfaceMaterials(mesh, comp, syncToken) {
    const resolver = this.assetResolver;
    if (!resolver?.getMaterialDefinition) return;
    const actorId = mesh.userData?.actorId;
    const visualEpoch = mesh.userData?.visualEpoch;
    const stillCurrent = () => this._isActorVisualCurrent(actorId, syncToken, visualEpoch);
    const surfaceIds = mesh.userData?.surfaceIds
      || mesh.geometry?.userData?.surfaceIds
      || null;

    const mapResolver = (assetId) => {
      if (resolver?.getTextureAsset) {
        const src = resolver.getTextureAsset(assetId);
        if (!src?.url) return null;
        return { url: assetUrl(src.url) || src.url, meta: src.meta, path: src.path };
      }
      if (!resolver?.getTextureUrl) return null;
      return assetUrl(resolver.getTextureUrl(assetId));
    };
    const resolveDef = async (materialId) => {
      if (!materialId) return null;
      return resolver.getMaterialDefinition(materialId);
    };

    // Single-material fallback path (no surface groups).
    if (!surfaceIds?.length || !Array.isArray(mesh.material)) {
      const matId = comp.materialId;
      if (!matId) return;
      const def = await resolveDef(matId);
      if (!stillCurrent() || !def) return;
      const uvChannels = inspectGeometryUvChannels(mesh).channels;
      const mat = await createThreeMaterial(def, mapResolver, {
        maxAnisotropy: this.maxAnisotropy,
        availableUvChannels: uvChannels,
      });
      if (!stillCurrent()) {
        disposeMaterial(mat);
        return;
      }
      if (mesh.userData) mesh.userData.bbUvWarnings = mat.userData?.bbUvWarnings || [];
      const prev = mesh.material;
      mesh.material = mat;
      if (prev && prev !== mat) {
        if (Array.isArray(prev)) prev.forEach((m) => disposeMaterial(m));
        else disposeMaterial(prev);
      }
      return;
    }

    const defaultDef = await resolveDef(comp.materialId);
    if (!stillCurrent()) return;
    const uvChannels = inspectGeometryUvChannels(mesh).channels;
    const surfaceWarnings = [];

    for (let i = 0; i < surfaceIds.length; i += 1) {
      const surfaceId = surfaceIds[i];
      const faceMatId = resolveSurfaceMaterialId(comp, surfaceId);
      let def = null;
      if (faceMatId && faceMatId === comp.materialId) def = defaultDef;
      else if (faceMatId) def = await resolveDef(faceMatId);
      if (!stillCurrent()) return;
      if (!def) continue;

      const mat = await createThreeMaterial(def, mapResolver, {
        maxAnisotropy: this.maxAnisotropy,
        availableUvChannels: uvChannels,
      });
      if (!stillCurrent()) {
        disposeMaterial(mat);
        return;
      }
      if (mat.userData?.bbUvWarnings?.length) {
        surfaceWarnings.push(...mat.userData.bbUvWarnings);
      }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        if (mat[key]) mat[key].anisotropy = this.maxAnisotropy;
      }
      const old = mesh.material[i];
      mesh.material[i] = mat;
      disposeMaterial(old);
    }
    if (mesh.userData) mesh.userData.bbUvWarnings = surfaceWarnings;
    mesh.material.needsUpdate = true;
    if (this.selectedSurface?.actorId === mesh.userData.actorId) {
      this._refreshSurfaceHighlight();
    }
  }

  async _applyBrushMaterials(mesh, comp, syncToken) {
    const resolver = this.assetResolver;
    const actorId = mesh.userData?.actorId;
    const visualEpoch = mesh.userData?.visualEpoch;
    const stillCurrent = () => this._isActorVisualCurrent(actorId, syncToken, visualEpoch);
    const mapResolver = (assetId) => {
      if (resolver?.getTextureAsset) {
        const src = resolver.getTextureAsset(assetId);
        if (!src?.url) return null;
        return { url: assetUrl(src.url) || src.url, meta: src.meta, path: src.path };
      }
      if (!resolver?.getTextureUrl) return null;
      return assetUrl(resolver.getTextureUrl(assetId));
    };

    const resolveDef = async (materialId) => {
      if (!materialId || !resolver?.getMaterialDefinition) return null;
      return resolver.getMaterialDefinition(materialId);
    };

    const defaultDef = await resolveDef(comp.materialId);
    if (!stillCurrent()) return;
    const uvChannels = inspectGeometryUvChannels(mesh).channels;
    const faceWarnings = [];

    for (let i = 0; i < FACE_KEYS.length; i += 1) {
      const faceKey = FACE_KEYS[i];
      const faceMatId = comp.faceMaterials?.[faceKey] || comp.materialId;
      let def = null;
      if (faceMatId && faceMatId === comp.materialId) def = defaultDef;
      else if (faceMatId) def = await resolveDef(faceMatId);
      if (!stillCurrent()) return;

      if (def) {
        const mat = await createThreeMaterial(def, mapResolver, {
          maxAnisotropy: this.maxAnisotropy,
          availableUvChannels: uvChannels,
        });
        // Actor rebuilt / world synced while textures loaded — release, do not attach.
        if (!stillCurrent()) {
          disposeMaterial(mat);
          return;
        }
        if (mat.userData?.bbUvWarnings?.length) {
          faceWarnings.push(...mat.userData.bbUvWarnings);
        }
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          if (mat[key]) mat[key].anisotropy = this.maxAnisotropy;
        }
        const old = mesh.material[i];
        mesh.material[i] = mat;
        disposeMaterial(old);
      }
    }
    if (mesh.userData) mesh.userData.bbUvWarnings = faceWarnings;
    // Re-apply after async material swap (World Solid outer hull stays invisible).
    this._applyHiddenHullFaces?.(mesh);
    mesh.material.needsUpdate = true;
  }
}
