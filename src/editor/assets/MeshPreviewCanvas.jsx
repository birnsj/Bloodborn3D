import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cloneLoadedMesh } from '../../runtime/meshLoader.js';

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
 * Simple orbit preview for material / texture swatches in 3D.
 */
export function MaterialPreviewCanvas({ color = '#8a9099', mapUrl = null }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141820);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    camera.position.set(1.4, 1.0, 1.6);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 3, 2);
    scene.add(light);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.55,
      metalness: 0.1,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 32), mat);
    scene.add(sphere);

    let disposed = false;
    if (mapUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(mapUrl, (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }

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
      sphere.rotation.y += 0.008;
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
      sphere.geometry.dispose();
      if (mat.map) mat.map.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [color, mapUrl]);

  return <canvas ref={canvasRef} className="bb-mesh-preview-canvas" />;
}
