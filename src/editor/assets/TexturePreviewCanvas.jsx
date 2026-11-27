import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { applyTextureSampling, isCompressedTexturePath } from '../../assets/textureSampling.js';
import { loadTexture } from '../../runtime/materialFactory.js';
import { isSharedGpuResource, markOwnedGpuResource } from '../../runtime/gpuResources.js';

/**
 * Live tiled preview of texture sampling / transform / channel isolation.
 * Draft sampler/transform settings are applied on an owned clone so the shared
 * materialFactory cache is not mutated until TextureInspector Apply.
 */
export function TexturePreviewCanvas({
  url,
  path,
  sampler,
  transform,
  channelView = 'rgba',
  compressed = false,
  maxAnisotropy = 8,
  onProbeSize,
}) {
  const mountRef = useRef(null);
  const sharedRef = useRef(null);
  const cloneRef = useRef(null);
  const apiRef = useRef({});

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !url) return undefined;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1e24);
    const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
    camera.position.z = 2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // updateStyle true so canvas CSS matches the mount box; false left the
    // buffer-sized canvas overflowing (and covering stats) at devicePixelRatio > 1.
    renderer.setSize(el.clientWidth || 280, el.clientHeight || 180, true);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    el.appendChild(renderer.domElement);

    const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const makeChannelShader = (mode) => new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        mode: { value: mode },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform int mode;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          float v = mode == 0 ? c.r : mode == 1 ? c.g : mode == 2 ? c.b : c.a;
          gl_FragColor = vec4(v, v, v, 1.0);
        }
      `,
      toneMapped: false,
    });

    const channelMats = {
      r: makeChannelShader(0),
      g: makeChannelShader(1),
      b: makeChannelShader(2),
      a: makeChannelShader(3),
    };

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };

    const applyChannel = (tex) => {
      const view = apiRef.current.channelView || 'rgba';
      if (view === 'rgba') {
        mesh.material = mat;
        mat.map = tex;
        mat.needsUpdate = true;
        return;
      }
      const sm = channelMats[view] || channelMats.r;
      sm.uniforms.map.value = tex;
      mesh.material = sm;
    };

    const disposeClone = () => {
      const tex = cloneRef.current;
      cloneRef.current = null;
      if (tex && !isSharedGpuResource(tex)) {
        tex.dispose?.();
      }
    };

    const paintFromShared = (shared) => {
      if (!shared || disposed) return;
      disposeClone();
      const clone = markOwnedGpuResource(shared.clone());
      applyTextureSampling(clone, {
        sampler: apiRef.current.sampler,
        transform: apiRef.current.transform,
        role: 'color',
        maxAnisotropy: apiRef.current.maxAnisotropy,
        compressed: clone.isCompressedTexture,
      });
      // Preview tiling: show wrap by using a slightly larger UV plane via repeat already on clone.
      cloneRef.current = clone;
      applyChannel(clone);
      render();
    };

    apiRef.current = {
      sampler,
      transform,
      maxAnisotropy,
      channelView,
      paintFromShared,
      applyChannel,
      render,
    };

    (async () => {
      // Load once with identity meta so draft edits do not create unbounded cache keys.
      const shared = await loadTexture(url, {
        meta: {},
        role: 'color',
        maxAnisotropy: 16,
        compressed: compressed || isCompressedTexturePath(path || url),
        renderer,
      });
      if (disposed || !shared) return;
      sharedRef.current = shared;
      const img = shared.image;
      const w = img?.width || img?.videoWidth || shared.source?.data?.width || 0;
      const h = img?.height || img?.videoHeight || shared.source?.data?.height || 0;
      if (w && h) onProbeSize?.(w, h);
      paintFromShared(shared);
    })();

    const onResize = () => {
      if (!el) return;
      renderer.setSize(el.clientWidth || 280, el.clientHeight || 180, true);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      render();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      disposed = true;
      ro.disconnect();
      disposeClone();
      geo.dispose();
      mat.dispose();
      Object.values(channelMats).forEach((m) => m.dispose?.());
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      sharedRef.current = null;
    };
    // Mount once per url/path/compressed — draft sampler updates use the second effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, path, compressed, onProbeSize]);

  useEffect(() => {
    apiRef.current.sampler = sampler;
    apiRef.current.transform = transform;
    apiRef.current.maxAnisotropy = maxAnisotropy;
    apiRef.current.channelView = channelView;
    if (sharedRef.current && apiRef.current.paintFromShared) {
      apiRef.current.paintFromShared(sharedRef.current);
    }
  }, [sampler, transform, channelView, maxAnisotropy]);

  return (
    <div className="bb-texture-preview" ref={mountRef} aria-label="Texture preview" />
  );
}
