import { describe, expect, it } from 'vitest';
import {
  applyListMultiSelect,
  collectCollapsibleFolderPaths,
  flattenVisibleFolderPaths,
  listSelectModifiers,
} from '../editor/selection/listMultiSelect.js';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('applyListMultiSelect', () => {
  it('plain click selects only the target', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a', 'c'],
      anchorId: 'a',
      targetId: 'd',
    })).toEqual({ selectedIds: ['d'], anchorId: 'd' });
  });

  it('ctrl toggles membership', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a'],
      anchorId: 'a',
      targetId: 'c',
      ctrl: true,
    })).toEqual({ selectedIds: ['a', 'c'], anchorId: 'c' });

    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a', 'c'],
      anchorId: 'c',
      targetId: 'a',
      ctrl: true,
    })).toEqual({ selectedIds: ['c'], anchorId: 'a' });
  });

  it('shift selects inclusive range from anchor', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['b'],
      anchorId: 'b',
      targetId: 'd',
      shift: true,
    })).toEqual({ selectedIds: ['b', 'c', 'd'], anchorId: 'b' });
  });

  it('ctrl+shift unions range into selection', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a'],
      anchorId: 'a',
      targetId: 'c',
      shift: true,
      ctrl: true,
    })).toEqual({ selectedIds: ['a', 'b', 'c'], anchorId: 'a' });
  });

  it('alt removes a single item', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a', 'c', 'e'],
      anchorId: 'a',
      targetId: 'c',
      alt: true,
    })).toEqual({ selectedIds: ['a', 'e'], anchorId: 'a' });
  });

  it('alt+shift removes a range', () => {
    expect(applyListMultiSelect({
      orderedIds: ORDER,
      selectedIds: ['a', 'b', 'c', 'd', 'e'],
      anchorId: 'b',
      targetId: 'd',
      shift: true,
      alt: true,
    })).toEqual({ selectedIds: ['a', 'e'], anchorId: 'b' });
  });
});

describe('listSelectModifiers', () => {
  it('reads shift/ctrl/meta/alt', () => {
    expect(listSelectModifiers({
      shiftKey: true,
      ctrlKey: false,
      metaKey: true,
      altKey: true,
    })).toEqual({ shift: true, ctrl: true, alt: true });
  });
});

describe('flattenVisibleFolderPaths', () => {
  it('skips children of collapsed nodes', () => {
    const tree = [
      { path: 'A', children: [{ path: 'A/1' }, { path: 'A/2' }] },
      { path: 'B', children: [{ path: 'B/1' }] },
    ];
    expect(flattenVisibleFolderPaths(tree, new Set(['A']))).toEqual(['A', 'B', 'B/1']);
  });
});

describe('collectCollapsibleFolderPaths', () => {
  it('collects every folder path that has children', () => {
    const tree = [
      {
        path: 'Cat',
        children: [
          { path: 'A', children: [{ path: 'A/1' }, { path: 'A/2' }] },
          { path: 'B', children: [{ path: 'B/1' }] },
          { path: 'Leaf' },
        ],
      },
    ];
    expect(collectCollapsibleFolderPaths(tree)).toEqual(['Cat', 'A', 'B']);
  });
});
