import { useRef } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  PRIMITIVE_TYPES,
  PRIMITIVE_COLLISION_TYPES,
  PARAMETRIC_FN_IDS,
  PRIMITIVE_MAX_SEGMENTS,
  primitiveMeshAuthorableSnapshot,
  validatePrimitiveAllocation,
} from '../../components/PrimitiveMeshComponent.js';

export function PrimScrubNumber({
  primitiveMesh,
  field,
  map,
  label = 'Edit primitive',
  value,
  disabled,
  step,
  min,
  max,
}) {
  const { updateSelectedPrimitiveMesh, commitPrimitiveMeshGesture } = useEditor();
  const beforeRef = useRef(null);
  return (
    <ScrubNumberInput
      className="bb-input"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onGestureStart={() => {
        if (!primitiveMesh || beforeRef.current) return;
        beforeRef.current = primitiveMeshAuthorableSnapshot(primitiveMesh);
      }}
      onChange={(v) => {
        const partial = typeof map === 'function' ? map(v) : { [field]: v };
        updateSelectedPrimitiveMesh(partial, { undoable: false });
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitPrimitiveMeshGesture?.(before, label);
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (!before) return;
        updateSelectedPrimitiveMesh(before, { undoable: false });
      }}
    />
  );
}

export function PrimitiveMeshDetailsSection({
  primitiveMesh,
  disabled,
  materials,
  updateSelectedPrimitiveMesh,
}) {
  const type = primitiveMesh.primitive || 'box';
  const alloc = validatePrimitiveAllocation(primitiveMesh);
  const isBoxLike = type === 'box' || type === 'roundedBox';
  const isPlaneLike = type === 'plane';
  const isRadial = ['circle', 'sphere', 'cylinder', 'cone', 'capsule', 'ring', 'torus', 'torusKnot',
    'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 'parametric'].includes(type);
  const isProfile = type === 'shape' || type === 'extrude' || type === 'lathe';
  const isPath = type === 'tube';
  const isConvex = type === 'convex';
  const isText = type === 'text';
  const isParametric = type === 'parametric';

  return (
    <Collapsible title="Primitive Mesh" storageKey="details.primitiveMesh" defaultOpen>
      <div {...helpProps('details.primitiveMesh')}>
        <p className="bb-muted">
          Native / procedural prop geometry (Batch 5). Complements brushes — not used for subtractive CSG.
        </p>
        <label className="bb-field">
          <span className="bb-field__label">Type</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={type}
            onChange={(e) => updateSelectedPrimitiveMesh({ primitive: e.target.value })}
          >
            {PRIMITIVE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="bb-field" {...helpProps('details.primitiveMesh.material')}>
          <span className="bb-field__label">Material</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={primitiveMesh.materialId || ''}
            onChange={(e) => updateSelectedPrimitiveMesh({ materialId: e.target.value || null })}
          >
            <option value="">Default</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        </label>

        {(isBoxLike || isPlaneLike) && (
          <Collapsible title="Size" storageKey="details.primitiveMesh.size" defaultOpen>
            <label className="bb-field">
              <span className="bb-field__label">Width</span>
              <PrimScrubNumber primitiveMesh={primitiveMesh} field="width" min={1} step={5} disabled={disabled} value={primitiveMesh.width} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Height</span>
              <PrimScrubNumber primitiveMesh={primitiveMesh} field="height" min={1} step={5} disabled={disabled} value={primitiveMesh.height} />
            </label>
            {isBoxLike && (
              <label className="bb-field">
                <span className="bb-field__label">Depth</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="depth" min={1} step={5} disabled={disabled} value={primitiveMesh.depth} />
              </label>
            )}
            {type === 'roundedBox' && (
              <label className="bb-field">
                <span className="bb-field__label">Corner radius</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="tube" min={0.5} step={1} disabled={disabled} value={primitiveMesh.tube} />
              </label>
            )}
          </Collapsible>
        )}

        {isRadial && (
          <Collapsible title="Radius / length" storageKey="details.primitiveMesh.radius" defaultOpen>
            {type !== 'cylinder' && (
              <label className="bb-field">
                <span className="bb-field__label">Radius</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="radius" min={0.5} step={1} disabled={disabled} value={primitiveMesh.radius} />
              </label>
            )}
            {type === 'cylinder' && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Radius top</span>
                  <PrimScrubNumber primitiveMesh={primitiveMesh} field="radiusTop" min={0} step={1} disabled={disabled} value={primitiveMesh.radiusTop} />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Radius bottom</span>
                  <PrimScrubNumber primitiveMesh={primitiveMesh} field="radiusBottom" min={0} step={1} disabled={disabled} value={primitiveMesh.radiusBottom} />
                </label>
              </>
            )}
            {(type === 'cylinder' || type === 'cone') && (
              <label className="bb-field">
                <span className="bb-field__label">Height</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="height" min={1} step={5} disabled={disabled} value={primitiveMesh.height} />
              </label>
            )}
            {type === 'capsule' && (
              <label className="bb-field">
                <span className="bb-field__label">Length</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="length" min={1} step={5} disabled={disabled} value={primitiveMesh.length} />
              </label>
            )}
            {(type === 'torus' || type === 'torusKnot' || type === 'ring') && (
              <label className="bb-field">
                <span className="bb-field__label">{type === 'ring' ? 'Inner radius' : 'Tube'}</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="tube" min={0.5} step={1} disabled={disabled} value={primitiveMesh.tube} />
              </label>
            )}
          </Collapsible>
        )}

        <Collapsible title="Segments / detail" storageKey="details.primitiveMesh.segments" defaultOpen>
          <p className="bb-muted" {...helpProps('details.primitiveMesh.segments')}>
            Higher density improves displacement relief. Soft cap {PRIMITIVE_MAX_SEGMENTS} per axis
            (~{PRIMITIVE_MAX_SEGMENTS ** 2} verts for planes). Brushes are not retessellated.
          </p>
          {(type === 'plane' || type === 'sphere' || isBoxLike) && (
            <>
              <label className="bb-field">
                <span className="bb-field__label">Width segments</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="widthSegments" min={1} max={PRIMITIVE_MAX_SEGMENTS} step={1} disabled={disabled} value={primitiveMesh.widthSegments} />
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Height segments</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="heightSegments" min={1} max={PRIMITIVE_MAX_SEGMENTS} step={1} disabled={disabled} value={primitiveMesh.heightSegments} />
              </label>
            </>
          )}
          {(type === 'plane' || type === 'sphere') && (
            <label className="bb-field">
              <span className="bb-field__label">Displacement segments</span>
              <PrimScrubNumber primitiveMesh={primitiveMesh} field="displacementSegments" min={0} max={PRIMITIVE_MAX_SEGMENTS} step={1} disabled={disabled} value={primitiveMesh.displacementSegments} label="Edit displacement segments" />
            </label>
          )}
          {['circle', 'cylinder', 'cone', 'capsule', 'ring', 'torus', 'torusKnot', 'lathe', 'tube'].includes(type) && (
            <label className="bb-field">
              <span className="bb-field__label">Radial segments</span>
              <PrimScrubNumber primitiveMesh={primitiveMesh} field="radialSegments" min={3} max={PRIMITIVE_MAX_SEGMENTS} step={1} disabled={disabled} value={primitiveMesh.radialSegments} />
            </label>
          )}
          {type.endsWith('hedron') && (
            <label className="bb-field">
              <span className="bb-field__label">Detail</span>
              <PrimScrubNumber primitiveMesh={primitiveMesh} field="detail" min={0} max={5} step={1} disabled={disabled} value={primitiveMesh.detail} />
            </label>
          )}
          {!alloc.ok && <p className="bb-muted" style={{ color: '#c66' }}>{alloc.message}</p>}
          {alloc.ok && <p className="bb-muted">~{alloc.estimate} vertices</p>}
        </Collapsible>

        {(isProfile || isPath || isConvex || isText || isParametric || type === 'extrude' || type === 'tube') && (
          <Collapsible title="Procedural" storageKey="details.primitiveMesh.procedural" defaultOpen>
            {type === 'extrude' && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Extrude depth</span>
                  <PrimScrubNumber primitiveMesh={primitiveMesh} field="extrudeDepth" min={1} step={1} disabled={disabled} value={primitiveMesh.extrudeDepth} />
                </label>
                <label className="bb-field bb-field--row">
                  <span className="bb-field__label">Bevel</span>
                  <input type="checkbox" disabled={disabled} checked={primitiveMesh.bevelEnabled !== false} onChange={(e) => updateSelectedPrimitiveMesh({ bevelEnabled: e.target.checked })} />
                </label>
              </>
            )}
            {type === 'tube' && (
              <label className="bb-field">
                <span className="bb-field__label">Tube radius</span>
                <PrimScrubNumber primitiveMesh={primitiveMesh} field="tubeRadius" min={0.5} step={1} disabled={disabled} value={primitiveMesh.tubeRadius} />
              </label>
            )}
            {isText && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Text</span>
                  <input
                    className="bb-input"
                    disabled={disabled}
                    value={primitiveMesh.text || ''}
                    onChange={(e) => updateSelectedPrimitiveMesh({ text: e.target.value.slice(0, 64) })}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Size</span>
                  <PrimScrubNumber primitiveMesh={primitiveMesh} field="textSize" min={1} step={1} disabled={disabled} value={primitiveMesh.textSize} />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Depth</span>
                  <PrimScrubNumber primitiveMesh={primitiveMesh} field="textHeight" min={0} step={1} disabled={disabled} value={primitiveMesh.textHeight} />
                </label>
              </>
            )}
            {isParametric && (
              <label className="bb-field">
                <span className="bb-field__label">Function</span>
                <select
                  className="bb-select"
                  disabled={disabled}
                  value={primitiveMesh.parametricFn || 'klein'}
                  onChange={(e) => updateSelectedPrimitiveMesh({ parametricFn: e.target.value })}
                >
                  {PARAMETRIC_FN_IDS.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
            )}
            {(isProfile || isPath || isConvex) && (
              <p className="bb-muted">
                Profile / path / hull points are authored as JSON arrays on the component
                ({isProfile ? `${primitiveMesh.profile?.length || 0} profile pts` : ''}
                {isPath ? `${primitiveMesh.path?.length || 0} path pts` : ''}
                {isConvex ? `${primitiveMesh.points?.length || 0} hull pts` : ''}).
                Defaults ship with each type; edit via level JSON or future curve editor.
              </p>
            )}
          </Collapsible>
        )}

        <Collapsible title="Collision / shadows" storageKey="details.primitiveMesh.collision">
          <label className="bb-field bb-field--row">
            <span className="bb-field__label">Collidable</span>
            <input
              type="checkbox"
              disabled={disabled}
              checked={primitiveMesh.collidable !== false}
              onChange={(e) => updateSelectedPrimitiveMesh({ collidable: e.target.checked })}
            />
          </label>
          <label className="bb-field">
            <span className="bb-field__label">Collision type</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={primitiveMesh.collisionType || 'auto'}
              onChange={(e) => updateSelectedPrimitiveMesh({ collisionType: e.target.value })}
            >
              {PRIMITIVE_COLLISION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="bb-field bb-field--row">
            <span className="bb-field__label">Cast shadow</span>
            <input type="checkbox" disabled={disabled} checked={primitiveMesh.castShadow !== false} onChange={(e) => updateSelectedPrimitiveMesh({ castShadow: e.target.checked })} />
          </label>
          <label className="bb-field bb-field--row">
            <span className="bb-field__label">Receive shadow</span>
            <input type="checkbox" disabled={disabled} checked={primitiveMesh.receiveShadow !== false} onChange={(e) => updateSelectedPrimitiveMesh({ receiveShadow: e.target.checked })} />
          </label>
        </Collapsible>
      </div>
    </Collapsible>
  );
}
