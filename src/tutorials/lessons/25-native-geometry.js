/** Academy lesson 25 — Batch 5 native / procedural geometry. */
export const nativeGeometryLesson = {
  id: 'native-geometry',
  title: 'Native Geometry Primitives',
  summary: 'Place Three.js primitives and procedural meshes as prop actors alongside architectural brushes.',
  order: 25,
  starterPath: 'tutorials/acceptance-geometry.json',
  steps: [
    {
      id: 'open-prims',
      title: 'Geometry category props',
      body: 'Open Creation → Geometry. Below Subtract are native primitives (sphere, torus, rounded box, …) and procedural tools (Shape, Extrude, Lathe, Tube, Convex, Text, Parametric). These place PrimitiveMesh actors — props, not brushes.',
      highlight: 'creation.geometry',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'details',
      title: 'Type-specific Details',
      body: 'Select a primitive. Details → Primitive Mesh exposes size, radius, segments, material, collision, and shadows. Scrubbing numbers uses one Undo entry per gesture.',
      highlight: 'details.primitiveMesh',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'segments',
      title: 'Segments for displacement',
      body: 'Plane and Sphere expose Displacement segments. Raise density so Batch 2 displacement maps show visible relief. Soft caps prevent runaway vertex counts. Architectural brushes are not retessellated.',
      highlight: 'details.primitiveMesh.segments',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'procedural',
      title: 'Procedural profiles',
      body: 'Shape / Extrude / Lathe use 2D profiles; Tube uses a 3D path; Convex uses a point hull; Text loads a local Helvetiker font. Defaults ship with each type.',
      highlight: 'toolbar.primitive',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'play-collision',
      title: 'Play collision',
      body: 'Press Play. Auto collision picks box / sphere / capsule / cylinder / convex / trimesh. Cone may approximate as a cylinder unless you choose convex. Text uses an AABB box.',
      highlight: 'details.primitiveMesh',
      verify: { type: 'manualConfirm' },
    },
  ],
};
