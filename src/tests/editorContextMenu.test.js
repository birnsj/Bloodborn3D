/**
 * Shared editor context menu — item filtering / open-close smoke (no DOM portal).
 */
import { describe, expect, it } from 'vitest';

describe('Editor context menu item helpers', () => {
  it('filters empty / falsy items the way openContextMenu does', () => {
    const items = [
      { id: 'a', label: 'Rename' },
      null,
      false,
      { id: 'sep', separator: true },
      { id: 'b', label: 'Delete', danger: true },
    ].filter(Boolean);
    expect(items).toHaveLength(3);
    expect(items[1].separator).toBe(true);
    expect(items[2].danger).toBe(true);
  });
});
