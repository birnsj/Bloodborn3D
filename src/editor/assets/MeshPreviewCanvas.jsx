import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cloneLoadedMesh } from '../../runtime/meshLoader.js';
import { createThreeMaterial, assetUrl } from '../../runtime/materialFactory.js';
import { installStudioEnvironment } from '../../runtime/studioEnvironment.js';

/**
 * Independent Three.js preview for Asset Viewer — not a GameRuntime.
 */
export function MeshPreviewCanvas({ url }) {
  const canvasRef = useRef(null);

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
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

    cloneLoadedMesh(url).then((loaded) => {
      if (disposed || !loaded?.root) return;
      root = loaded.root;
      scene.add(root);
      fit(root);
    });

    const tick = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (root) {
        scene.remove(root);
        root.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
      }
      renderer.dispose();
    };
  }, [url]);

  return <canvas ref={canvasRef} className="bb-mesh-preview-canvas" />;
}

/**
 * Lit PBR material preview for Asset Viewer / Materials workspace.
 * @param {'sphere'|'cube'|'plane'} [shape]
 */
export function MaterialPreviewCanvas({
  definition = null,
  color = '#8a9099',
  mapUrl = null,
  getTextureUrl = null,
  shape = 'sphere',
}) {
  const canvasRef = useRef(null);
  const previewShape = shape === 'cube' || shape === 'plane' ? shape : 'sphere';
  const defKey = definition
    ? [
        definition.id,
        definition.baseColor,
        definition.baseColorMapId,
        definition.normalMapId,
        definition.roughnessMapId,
        definition.metalnessMapId,
        definition.emissiveMapId,
        definition.roughness,
        definition.metalness,
        definition.normalScale,
        definition.envMapIntensity,
        definition.emissive,
        definition.emissiveIntensity,
        definition.opacity,
        definition.transparent,
        definition.uvScale?.x,
        definition.uvScale?.y,
        definition.uvOffset?.x,
        definition.uvOffset?.y,
        definition.uvRotation,
        previewShape,
      ].join('|')
    : `${color}|${mapUrl || ''}|${previewShape}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161d);
    const studioEnv = installStudioEnvironment(renderer, scene, { intensity: 0.85 });

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    camera.position.set(1.55, 0.85, 1.85);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 4;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xb8c4d8, 0.22));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.55);
    key.position.set(2.4, 3.2, 2.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8aa0c0, 0.4);
    fill.position.set(-2.2, 1.4, -1.8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd0e0ff, 0.35);
    rim.position.set(0.2, 1.0, -2.5);
    scene.add(rim);

    // Soft ground disc so the mesh reads as grounded.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a1f28,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.56;
    scene.add(ground);

    let mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.55,
      metalness: 0.08,
    });
    const geometry = previewShape === 'cube'
      ? new THREE.BoxGeometry(0.95, 0.95, 0.95)
      : previewShape === 'plane'
        ? new THREE.PlaneGeometry(1.3, 1.3, 1, 1)
        : new THREE.SphereGeometry(0.55, 64, 48);
    const mesh = new THREE.Mesh(geometry, mat);
    if (previewShape === 'plane') {
      mesh.position.y = -0.05;
    }
    scene.add(mesh);

    let disposed = false;
    const textures = [];

    const applyDefinition = async () => {
      if (!definition) {
        if (mapUrl) {
          const loader = new THREE.TextureLoader();
          loader.load(mapUrl, (tex) => {
            if (disposed) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            textures.push(tex);
            mat.map = tex;
            mat.needsUpdate = true;
          });
        }
        return;
      }

      const resolver = (assetId) => {
        if (!assetId || !getTextureUrl) return null;
        return assetUrl(getTextureUrl(assetId));
      };
      const next = await createThreeMaterial(definition, resolver);
      if (disposed) {
        next.dispose();
        return;
      }
      for (const mapKey of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        if (next[mapKey]) textures.push(next[mapKey]);
      }
      mesh.material = next;
      mat.dispose();
      mat = next;
    };

    void applyDefinition();

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

    let raf = 0;
    const tick = () => {
      if (disposed) return;
      if (previewShape !== 'plane') {
        mesh.rotation.y += 0.006;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      mesh.geometry.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      for (const tex of textures) tex.dispose?.();
      mat.dispose();
      studioEnv?.dispose?.();
      scene.environment = null;
      renderer.dispose();
    };
  }, [defKey, color, mapUrl, getTextureUrl, previewShape]);

  return <canvas ref={canvasRef} className="bb-mesh-preview-canvas" />;
}
