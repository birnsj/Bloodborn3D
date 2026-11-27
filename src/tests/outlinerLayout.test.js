import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import {
  buildOutlinerDisplayRoots,
  deleteOutlinerCategory,
  insertOutlinerCategory,
  normalizeOutlinerLayout,
  placeInOutlinerRootOrder,
  setOutlinerCategoryIconColor,
} from '../core/outlinerLayout.js';

function worldWithRoots(names) {
  const world = new World({ name: 'Test' });
  for (const name of names) {
    world.addActor(new Actor({ id: `a_${name}`, name }));
  }
  return world;
}

describe('outlinerLayout', () => {
  it('treats categories as section headers over following roots', () => {
    const world = worldWithRoots(['Floor', 'Light', 'Prop']);
    const withCat = insertOutlinerCategory(
      { rootOrder: ['a_Floor', 'a_Light', 'a_Prop'], categories: {} },
      { id: 'ocat_lights', name: 'Lighting', afterId: 'a_Floor' },
    );
    // Move light into the Lighting section (after the category).
    const laid = placeInOutlinerRootOrder(withCat.layout, ['a_Light'], {
      targetId: 'ocat_lights',
      edge: 'into',
    });
    const { nodes } = buildOutlinerDisplayRoots(world, laid);
    const lighting = nodes.find((n) => n.id === 'ocat_lights');
    expect(lighting?.kind).toBe('category');
    expect(lighting.children.map((a) => a.id)).toContain('a_Light');
  });

  it('deletes category header without removing actors', () => {
    const world = worldWithRoots(['A', 'B']);
    let layout = {
      rootOrder: ['ocat_x', 'a_A', 'a_B'],
      categories: { ocat_x: { name: 'Group' } },
    };
    layout = deleteOutlinerCategory(layout, 'ocat_x');
    const normalized = normalizeOutlinerLayout(layout, world);
    expect(normalized.categories.ocat_x).toBeUndefined();
    expect(normalized.rootOrder).toEqual(['a_A', 'a_B']);
  });

  it('appends new root actors during normalize', () => {
    const world = worldWithRoots(['Old', 'New']);
    const normalized = normalizeOutlinerLayout(
      { rootOrder: ['a_Old'], categories: {} },
      world,
    );
    expect(normalized.rootOrder).toContain('a_New');
  });

  it('stores category icon colors', () => {
    const world = worldWithRoots(['A']);
    let layout = insertOutlinerCategory(
      { rootOrder: ['a_A'], categories: {} },
      { id: 'ocat_paint', name: 'Paint' },
    ).layout;
    layout = setOutlinerCategoryIconColor(layout, 'ocat_paint', '#AABBCC');
    const normalized = normalizeOutlinerLayout(layout, world);
    expect(normalized.categories.ocat_paint.iconColor).toBe('#aabbcc');
    const { nodes } = buildOutlinerDisplayRoots(world, normalized);
    expect(nodes.find((n) => n.id === 'ocat_paint')?.iconColor).toBe('#aabbcc');
    layout = setOutlinerCategoryIconColor(layout, 'ocat_paint', null);
    expect(normalizeOutlinerLayout(layout, world).categories.ocat_paint.iconColor).toBeUndefined();
  });
});
