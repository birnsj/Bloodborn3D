import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cloneLoadedMesh, loadGltfScene } from '../../runtime/meshLoader.js';
import { disposeObjectTree } from '../../runtime/gpuResources.js';
import { suppressNativeImageMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';

const VIEW_MODES = [
  { id: 'textured', label: 'Textured' },
  { id: 'untextured', label: 'Untextured' },
  { id: 'wireframe', label: 'Wireframe' },
];

/**
 * Orbit / pan / zoom mesh preview for Meshy results with material inspection.
 */
export function MeshyModelPreview({
  url,
  referenceUrl = null,
  lightIntensity = 1,
  onStats = null,
}) {
  const canvasRef = useRef(null);
  const [viewMode, setViewMode] = useState('textured');
  const [light, setLight] = useState(lightIntensity);
  const [showRef, setShowRef] = useState(Boolean(referenceUrl));
  const [stats, setStats] = useState(null);
  const viewModeRef = useRef(viewMode);
  const lightRef = useRef(light);
  viewModeRef.current = viewMode;
  lightRef.current = light;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141820);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    camera.position.set(1.8, 1.4, 2.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa8b8d0, 0.35);
    fill.position.set(-2, 2, -3);
    scene.add(fill);

    const grid = new THREE.GridHelper(4, 8, 0x3a4555, 0x2a3038);
    scene.add(grid);

    let root = null;
    let raf = 0;
    let disposed = false;
    const materialBackup = new Map();

    const applyViewMode = () => {
      if (!root) return;
      const mode = viewModeRef.current;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat, i) => {
          if (!mat) return;
          const keyId = `${obj.uuid}:${i}`;
          if (!materialBackup.has(keyId)) {
            materialBackup.set(keyId, {
              map: mat.map || null,
              normalMap: mat.normalMap || null,
              roughnessMap: mat.roughnessMap || null,
              metalnessMap: mat.metalnessMap || null,
              color: mat.color?.clone?.() || null,
              wireframe: Boolean(mat.wireframe),
            });
          }
          const bak = materialBackup.get(keyId);
          if (mode === 'wireframe') {
            mat.wireframe = true;
            mat.map = null;
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
            if (mat.color) mat.color.set(0x9ec5ff);
          } else if (mode === 'untextured') {
            mat.wireframe = false;
            mat.map = null;
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
            if (mat.color) mat.color.set(0xc8cdd5);
          } else {
            mat.wireframe = bak.wireframe;
            mat.map = bak.map;
            mat.normalMap = bak.normalMap;
            mat.roughnessMap = bak.roughnessMap;
            mat.metalnessMap = bak.metalnessMap;
            if (mat.color && bak.color) mat.color.copy(bak.color);
          }
          mat.needsUpdate = true;
        });
      });
    };

    const fit = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      object.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const dist = maxDim * 2.2;
      camera.position.set(dist, dist * 0.7, dist);
      controls.target.set(0, 0, 0);
      controls.update();
      return { size, maxDim };
    };

    const resize = () => {
      const w = canvas.clientWidth || 280;
      const h = canvas.clientHeight || 200;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      const intensity = lightRef.current;
      ambient.intensity = 0.35 * intensity;
      key.intensity = 0.95 * intensity;
      fill.intensity = 0.35 * intensity;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    (async () => {
      try {
        const loaded = await cloneLoadedMesh(url);
        if (!loaded?.root || disposed) {
          if (loaded?.root) disposeObjectTree(loaded.root);
          return;
        }
        root = loaded.root;
        scene.add(root);
        const dims = fit(root);
        applyViewMode();

        const full = await loadGltfScene(url).catch(() => null);
        const inspected = inspectGltf(root, full?.meta, dims);
        setStats(inspected);
        onStats?.(inspected);
      } catch (err) {
        setStats({ error: err.message || String(err) });
      }
    })();

    const onMode = () => applyViewMode();
    canvas._bbApplyViewMode = onMode;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (root) {
        scene.remove(root);
        disposeObjectTree(root);
      }
      renderer.dispose();
      materialBackup.clear();
    };
  }, [url, onStats]);

  useEffect(() => {
    canvasRef.current?._bbApplyViewMode?.();
  }, [viewMode]);

  const dimLabel = useMemo(() => {
    if (!stats?.sizeMeters) return null;
    const s = stats.sizeMeters;
    return `${fmt(s.x)} × ${fmt(s.y)} × ${fmt(s.z)} m`;
  }, [stats]);

  return (
    <div className="bb-meshy-preview">
      <div className="bb-meshy-preview__toolbar">
        <div className="bb-seg" role="group" aria-label="View mode">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`bb-btn bb-btn--ghost${viewMode === m.id ? ' is-active' : ''}`}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="bb-field bb-field--row bb-meshy-preview__light">
          <span className="bb-muted">Light</span>
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.05}
            value={light}
            onChange={(e) => setLight(Number(e.target.value))}
          />
        </label>
        {referenceUrl && (
          <label className="bb-field bb-field--row">
            <input
              type="checkbox"
              checked={showRef}
              onChange={(e) => setShowRef(e.target.checked)}
            />
            <span className="bb-muted">Source reference</span>
          </label>
        )}
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          onClick={() => {
            // OrbitControls focus via re-fit is handled by remount; nudge target.
            const canvas = canvasRef.current;
            canvas?.dispatchEvent(new Event('bb-focus'));
          }}
          title="Reset framing"
        >
          Focus
        </button>
      </div>
      <div className="bb-meshy-preview__stage">
        <canvas ref={canvasRef} className="bb-meshy-preview__canvas" />
        {showRef && referenceUrl && (
          <div className="bb-meshy-preview__ref">
            <img
              src={referenceUrl}
              alt="Source reference"
              draggable={false}
              onContextMenu={suppressNativeImageMenu}
            />
          </div>
        )}
      </div>
      {stats && !stats.error && (
        <dl className="bb-meshy-preview__stats">
          <div><dt>Triangles</dt><dd>{stats.triangles?.toLocaleString?.() ?? stats.triangles}</dd></div>
          <div><dt>Vertices</dt><dd>{stats.vertices?.toLocaleString?.() ?? stats.vertices}</dd></div>
          <div><dt>Meshes</dt><dd>{stats.meshes}</dd></div>
          <div><dt>Materials</dt><dd>{stats.materials}</dd></div>
          <div><dt>Textures</dt><dd>{stats.textures}</dd></div>
          {dimLabel && <div><dt>Size</dt><dd>{dimLabel}</dd></div>}
          {stats.fileBytes != null && (
            <div><dt>File</dt><dd>{formatBytes(stats.fileBytes)}</dd></div>
          )}
          {stats.maps?.length > 0 && (
            <div className="bb-meshy-preview__maps">
              <dt>Maps</dt>
              <dd>{stats.maps.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
      {stats?.error && <p className="bb-muted">{stats.error}</p>}
    </div>
  );
}

function inspectGltf(root, meta, dims) {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const materials = new Set();
  const textures = new Set();
  const maps = new Set();

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    meshes += 1;
    const geo = obj.geometry;
    if (geo) {
      const idx = geo.index;
      const pos = geo.attributes?.position;
      if (idx) triangles += idx.count / 3;
      else if (pos) triangles += pos.count / 3;
      if (pos) vertices += pos.count;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!mat) return;
      materials.add(mat.uuid);
      for (const [slot, label] of [
        ['map', 'baseColor'],
        ['normalMap', 'normal'],
        ['roughnessMap', 'roughness'],
        ['metalnessMap', 'metalness'],
        ['emissiveMap', 'emissive'],
        ['aoMap', 'ao'],
      ]) {
        if (mat[slot]) {
          textures.add(mat[slot].uuid || mat[slot].id || label);
          maps.add(label);
        }
      }
    });
  });

  return {
    triangles: Math.round(triangles),
    vertices: Math.round(vertices),
    meshes,
    materials: materials.size,
    textures: textures.size,
    maps: [...maps],
    sizeMeters: dims?.size
      ? { x: dims.size.x, y: dims.size.y, z: dims.size.z }
      : meta?.boundingBoxMeters || null,
    fileBytes: meta?.bytes ?? null,
  };
}

function fmt(n) {
  return Number(n).toFixed(2);
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
