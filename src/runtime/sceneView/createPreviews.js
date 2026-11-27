// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters, DEFAULT_GRID_EDITOR_UNITS, WALL_MODULE_SIZE } from '../../core/units.js';
import { createRampWedgeGeometry } from '../rampGeometry.js';
import { createStairGeometry } from '../stairGeometry.js';
import { createColumnGeometry } from '../columnGeometry.js';
import { createArchGeometry } from '../archGeometry.js';
import { createCurvedWallGeometry } from '../curvedWallGeometry.js';
import { createFallbackBrushMaterial } from '../materialFactory.js';
import { createBrushFromBounds } from '../brushFactory.js';
import { createRampFromBounds } from '../rampFactory.js';
import { createStairFromBounds } from '../stairFactory.js';
import { createColumnFromBounds } from '../columnFactory.js';
import { createArchFromBounds } from '../archFactory.js';
import { createCurvedWallFromBounds } from '../curvedWallFactory.js';
import { DEFAULT_RAMP_RISE } from '../../components/RampComponent.js';
import { disposeObject } from './shared.js';

export class CreatePreviewMethods {
  setCreatePreview(boundsOrNull) {
    this._clearCreatePreview();
    if (!boundsOrNull) return;

    const {
      min,
      max,
      operation,
      valid = true,
      kind = 'box',
      gridSize = DEFAULT_GRID_EDITOR_UNITS,
    } = boundsOrNull;
    const subtract = operation === 'subtract' || kind === 'subtract';
    const opts = { valid, subtract };

    const actor = this._previewActorFromBounds(kind, min, max, gridSize);
    const content = actor
      ? this._buildCreatePreviewContent(actor, opts)
      : null;

    if (content) {
      const root = new THREE.Group();
      root.userData.placementIgnore = true;
      const t = actor.transform;
      root.position.set(
        toMeters(t.position.x),
        toMeters(t.position.y),
        toMeters(t.position.z),
      );
      root.rotation.set(
        THREE.MathUtils.degToRad(t.rotation?.x || 0),
        THREE.MathUtils.degToRad(t.rotation?.y || 0),
        THREE.MathUtils.degToRad(t.rotation?.z || 0),
      );
      root.add(content);
      this.scene.add(root);
      this._createPreview = root;
      return;
    }

    // Fallback AABB (lights / unknown) — solid, not translucent
    const { mat, edgeMat } = this._previewMaterials(opts, '#8a9099');
    const size = {
      x: Math.max(0.01, Math.abs(max.x - min.x)),
      y: Math.max(0.01, Math.abs(max.y - min.y)),
      z: Math.max(0.01, Math.abs(max.z - min.z)),
    };
    const center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(toMeters(size.x), toMeters(size.y), toMeters(size.z)),
      mat,
    );
    mesh.position.set(toMeters(center.x), toMeters(center.y), toMeters(center.z));
    mesh.userData.placementIgnore = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat));
    this.scene.add(mesh);
    this._createPreview = mesh;
  }

  _previewActorFromBounds(kind, min, max, gridSize) {
    try {
      if (kind === 'ramp') {
        return createRampFromBounds({ min, max, gridSize, rise: DEFAULT_RAMP_RISE });
      }
      if (kind === 'stair') {
        return createStairFromBounds({ min, max, gridSize, totalRise: WALL_MODULE_SIZE });
      }
      if (kind === 'column') {
        return createColumnFromBounds({ min, max, gridSize });
      }
      if (kind === 'arch' || kind === 'archRoman' || kind === 'archGothic') {
        return createArchFromBounds({
          min,
          max,
          gridSize,
          archType: kind === 'archGothic' ? 'gothic' : 'roman',
        });
      }
      if (kind === 'curvedWall') {
        return createCurvedWallFromBounds({ min, max, gridSize });
      }
      if (kind === 'box' || kind === 'wall' || kind === 'floor' || kind === 'ceiling' || kind === 'subtract') {
        return createBrushFromBounds({
          kind: kind === 'subtract' ? 'box' : kind,
          min,
          max,
          gridSize,
          operation: kind === 'subtract' ? 'subtract' : 'add',
        });
      }
    } catch (err) {
      console.warn('[SceneView] create-preview actor failed', kind, err);
      return null;
    }
    return null;
  }

  /**
   * Solid preview materials matching the placed object (not translucent ghosts).
   * Subtract cutters stay translucent so they read as volumes.
   */
  _previewMaterials({ valid = true, subtract = false } = {}, color = '#8a9099') {
    if (!valid) {
      return {
        mat: new THREE.MeshStandardMaterial({
          color: 0xc23b4a,
          roughness: 0.7,
          metalness: 0.05,
          emissive: 0xc23b4a,
          emissiveIntensity: 0.12,
        }),
        edgeMat: new THREE.LineBasicMaterial({ color: 0xff6688 }),
      };
    }
    if (subtract) {
      const subtractColor = this.viewportColors.subtract;
      const fillOpacity = Number.isFinite(this.subtractFillOpacity)
        ? Math.max(this.subtractFillOpacity, 0.08)
        : 0.28;
      return {
        mat: new THREE.MeshBasicMaterial({
          color: subtractColor,
          transparent: true,
          opacity: fillOpacity,
          depthWrite: false,
          depthTest: true,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
        edgeMat: new THREE.LineBasicMaterial({ color: subtractColor }),
      };
    }
    return {
      mat: createFallbackBrushMaterial(color, { editMode: true }),
      edgeMat: new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
    };
  }

  _buildCreatePreviewContent(actor, { valid = true, subtract = false } = {}) {
    const mark = (obj) => {
      obj.userData.placementIgnore = true;
      obj.traverse?.((c) => { c.userData.placementIgnore = true; });
      return obj;
    };
    const applyMat = (mesh, color) => {
      const { mat, edgeMat } = this._previewMaterials({ valid, subtract }, color);
      mesh.material = mat;
      mesh.castShadow = !subtract && valid;
      mesh.receiveShadow = !subtract && valid;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat));
      return mark(mesh);
    };

    const brush = actor.getComponent('Brush');
    if (brush) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          toMeters(brush.size.x),
          toMeters(brush.size.y),
          toMeters(brush.size.z),
        ),
      );
      return applyMat(mesh, brush.color || '#8a9099');
    }

    const ramp = actor.getComponent('Ramp');
    if (ramp) return applyMat(new THREE.Mesh(createRampWedgeGeometry(ramp)), ramp.color || '#8a9099');

    const stair = actor.getComponent('Stair');
    if (stair) {
      const steps = createStairGeometry(stair);
      const color = stair.color || '#8a9099';
      steps.traverse((child) => {
        if (!child.isMesh) return;
        applyMat(child, color);
      });
      return mark(steps);
    }

    const column = actor.getComponent('Column');
    if (column) {
      return applyMat(new THREE.Mesh(createColumnGeometry(column)), column.color || '#8a9099');
    }

    const arch = actor.getComponent('Arch');
    if (arch) return applyMat(new THREE.Mesh(createArchGeometry(arch)), arch.color || '#8a9099');

    const curved = actor.getComponent('CurvedWall');
    if (curved) {
      return applyMat(new THREE.Mesh(createCurvedWallGeometry(curved)), curved.color || '#8a9099');
    }

    return null;
  }

  /**
   * Solid placement preview + optional surface highlight disc.
   * Geometry tools use the same factory mesh as create-drag preview.
   * @param {null|{
   *   position:{x:number,y:number,z:number},
   *   size?:{x:number,y:number,z:number},
   *   valid?:boolean,
   *   normal?:{x:number,y:number,z:number},
   *   rotation?:{x:number,y:number,z:number},
   *   gridSnap?:boolean,
   *   kind?:string|null,
   *   min?:{x:number,y:number,z:number}|null,
   *   max?:{x:number,y:number,z:number}|null,
   *   gridSize?:number,
   * }} state
   */
  setPlacementPreview(state) {
    this._clearPlacementPreview();
    if (!state?.position) return;

    const valid = state.valid !== false;
    const size = state.size || { x: 40, y: 40, z: 40 };
    const opts = { valid, subtract: false };
    const group = new THREE.Group();
    group.userData.placementIgnore = true;

    let placedMesh = false;
    const kind = state.kind;
    const min = state.min;
    const max = state.max;
    const gridSize = state.gridSize || DEFAULT_GRID_EDITOR_UNITS;
    if (kind && min && max) {
      const actor = this._previewActorFromBounds(kind, min, max, gridSize);
      const content = actor
        ? this._buildCreatePreviewContent(actor, opts)
        : null;
      if (content && actor) {
        const root = new THREE.Group();
        root.userData.placementIgnore = true;
        const t = actor.transform;
        root.position.set(
          toMeters(t.position.x),
          toMeters(t.position.y),
          toMeters(t.position.z),
        );
        const rot = state.rotation || t.rotation;
        root.rotation.set(
          THREE.MathUtils.degToRad(rot?.x || 0),
          THREE.MathUtils.degToRad(rot?.y || 0),
          THREE.MathUtils.degToRad(rot?.z || 0),
        );
        root.add(content);
        group.add(root);
        placedMesh = true;
      }
    }

    if (!placedMesh) {
      const { mat, edgeMat } = this._previewMaterials(opts, '#8a9099');
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(toMeters(size.x), toMeters(size.y), toMeters(size.z)),
        mat,
      );
      box.position.set(
        toMeters(state.position.x),
        toMeters(state.position.y),
        toMeters(state.position.z),
      );
      box.userData.placementIgnore = true;
      box.add(new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), edgeMat));
      group.add(box);
    }

    if (state.normal) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(toMeters(28), 24),
        new THREE.MeshBasicMaterial({
          color: valid ? 0xa8c8e8 : 0xff6688,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      disc.position.set(
        toMeters(state.position.x),
        toMeters(state.position.y),
        toMeters(state.position.z),
      );
      // Orient disc to surface normal.
      const n = new THREE.Vector3(state.normal.x, state.normal.y, state.normal.z).normalize();
      disc.lookAt(disc.position.clone().add(n));
      disc.userData.placementIgnore = true;
      group.add(disc);
    }

    this.scene.add(group);
    this._placementPreview = group;
  }

  _clearCreatePreview() {
    if (this._createPreview) {
      this.scene.remove(this._createPreview);
      disposeObject(this._createPreview);
      this._createPreview = null;
    }
  }

  _clearPlacementPreview() {
    if (this._placementPreview) {
      this.scene.remove(this._placementPreview);
      disposeObject(this._placementPreview);
      this._placementPreview = null;
    }
  }
}
