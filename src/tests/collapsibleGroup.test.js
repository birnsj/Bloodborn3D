// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Collapsible,
  CollapsibleGroup,
  CollapsibleGroupToolbar,
} from '../ui/Collapsible.jsx';

describe('CollapsibleGroup', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it('collapses and expands all mounted sections', () => {
    act(() => {
      root.render(
        createElement(
          CollapsibleGroup,
          { storagePrefixes: ['test.'] },
          createElement(Collapsible, { title: 'A', storageKey: 'test.a', defaultOpen: true }, 'body-a'),
          createElement(Collapsible, { title: 'B', storageKey: 'test.b', defaultOpen: true }, 'body-b'),
        ),
      );
    });

    expect(container.textContent).toContain('body-a');
    expect(container.textContent).toContain('body-b');

    const collapseBtn = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Collapse All');
    act(() => {
      collapseBtn.click();
    });

    expect(container.textContent).not.toContain('body-a');
    expect(container.textContent).not.toContain('body-b');
    expect(localStorage.getItem('bloodbound.ui.collapse.test.a')).toBe('0');
    expect(localStorage.getItem('bloodbound.ui.collapse.test.b')).toBe('0');

    const expandBtn = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Expand All');
    act(() => {
      expandBtn.click();
    });

    expect(container.textContent).toContain('body-a');
    expect(container.textContent).toContain('body-b');
    expect(localStorage.getItem('bloodbound.ui.collapse.test.a')).toBe('1');
  });

  it('updates unmounted nested storage keys via prefixes', () => {
    localStorage.setItem('bloodbound.ui.collapse.test.nested.child', '1');
    act(() => {
      root.render(
        createElement(
          CollapsibleGroup,
          { storagePrefixes: ['test.'] },
          createElement(Collapsible, { title: 'Parent', storageKey: 'test.parent', defaultOpen: false }, 'hidden'),
        ),
      );
    });

    const collapseBtn = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Collapse All');
    act(() => {
      collapseBtn.click();
    });

    expect(localStorage.getItem('bloodbound.ui.collapse.test.nested.child')).toBe('0');
  });

  it('supports a header toolbar without inline controls', () => {
    act(() => {
      root.render(
        createElement(
          CollapsibleGroup,
          { showControls: false, storagePrefixes: ['test.'] },
          createElement(CollapsibleGroupToolbar),
          createElement(Collapsible, { title: 'A', storageKey: 'test.a', defaultOpen: true }, 'body-a'),
        ),
      );
    });

    expect(container.textContent).toContain('body-a');
    const collapseBtn = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Collapse All');
    expect(collapseBtn).toBeTruthy();
    act(() => {
      collapseBtn.click();
    });
    expect(container.textContent).not.toContain('body-a');
  });
});
