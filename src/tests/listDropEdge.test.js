import { describe, expect, it } from 'vitest';
import {
  getListDropEdge,
  LIST_DROP_AFTER,
  LIST_DROP_BEFORE,
  LIST_DROP_INTO,
  listDropEdgeClass,
} from '../editor/dnd/listDropEdge.js';

function fakeEl(top, height) {
  return {
    getBoundingClientRect: () => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100 }),
  };
}

describe('listDropEdge', () => {
  it('returns before / into / after from pointer Y', () => {
    const el = fakeEl(100, 100);
    expect(getListDropEdge(110, el)).toBe(LIST_DROP_BEFORE);
    expect(getListDropEdge(150, el)).toBe(LIST_DROP_INTO);
    expect(getListDropEdge(190, el)).toBe(LIST_DROP_AFTER);
  });

  it('collapses into to before/after when nesting is disabled', () => {
    const el = fakeEl(0, 100);
    expect(getListDropEdge(50, el, { allowInto: false })).toBe(LIST_DROP_AFTER);
    expect(getListDropEdge(40, el, { allowInto: false })).toBe(LIST_DROP_BEFORE);
  });

  it('maps edges to CSS modifiers', () => {
    expect(listDropEdgeClass(LIST_DROP_BEFORE)).toBe('is-drop-before');
    expect(listDropEdgeClass(LIST_DROP_AFTER)).toBe('is-drop-after');
    expect(listDropEdgeClass(LIST_DROP_INTO)).toBe('is-drop-into');
  });
});
