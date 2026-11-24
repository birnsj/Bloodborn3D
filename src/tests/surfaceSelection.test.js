import { describe, expect, it } from 'vitest';
import {
  nextSelectedSurfaceAfterActorChange,
  shouldApplyMaterialToSurface,
  toolKeepsSurfaceSelection,
} from '../editor/surfaceSelection.js';

describe('surfaceSelection — stale pick guards', () => {
  const surface = { actorId: 'wall_a', surfaceId: 'pz' };
  const world = {
    getActor: (id) => (id === 'wall_a' ? { id } : null),
  };

  it('shouldApplyMaterialToSurface only when Surface tool + live selected actor', () => {
    expect(shouldApplyMaterialToSurface({
      tool: 'surface',
      selectedSurface: surface,
      selectedActorIds: ['wall_a'],
      world,
    })).toBe(true);

    expect(shouldApplyMaterialToSurface({
      tool: 'select',
      selectedSurface: surface,
      selectedActorIds: ['wall_a'],
      world,
    })).toBe(false);

    expect(shouldApplyMaterialToSurface({
      tool: 'surface',
      selectedSurface: surface,
      selectedActorIds: ['other'],
      world,
    })).toBe(false);

    expect(shouldApplyMaterialToSurface({
      tool: 'surface',
      selectedSurface: surface,
      selectedActorIds: ['wall_a'],
      world: { getActor: () => null },
    })).toBe(false);

    expect(shouldApplyMaterialToSurface({
      tool: 'surface',
      selectedSurface: null,
      selectedActorIds: ['wall_a'],
      world,
    })).toBe(false);
  });

  it('nextSelectedSurfaceAfterActorChange clears on deselect / missing actor', () => {
    expect(nextSelectedSurfaceAfterActorChange(surface, ['wall_a'], world)).toBe(surface);
    expect(nextSelectedSurfaceAfterActorChange(surface, [], world)).toBeNull();
    expect(nextSelectedSurfaceAfterActorChange(surface, ['other'], world)).toBeNull();
    expect(nextSelectedSurfaceAfterActorChange(surface, ['wall_a'], { getActor: () => null })).toBeNull();
    expect(nextSelectedSurfaceAfterActorChange(null, ['wall_a'], world)).toBeNull();
  });

  it('toolKeepsSurfaceSelection covers Surface and Align only', () => {
    expect(toolKeepsSurfaceSelection('surface')).toBe(true);
    expect(toolKeepsSurfaceSelection('align')).toBe(true);
    expect(toolKeepsSurfaceSelection('select')).toBe(false);
    expect(toolKeepsSurfaceSelection('box')).toBe(false);
  });
});
