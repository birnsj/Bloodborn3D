// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import {
  dismissTourDialogs,
  dismissTourDropdowns,
} from '../tutorials/academyTourExecute.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Academy tour dialog dismiss', () => {
  it('cancels save prompts and OKs alerts', () => {
    const root = document.createElement('div');
    root.className = 'bb-dialog-root';
    root.innerHTML = `
      <div class="bb-dialog">
        <h2 class="bb-dialog__title">Save tutorial work as…</h2>
        <p class="bb-dialog__message">Enter a new level filename to keep this work</p>
        <input class="bb-dialog__input" />
        <div class="bb-dialog__footer">
          <button type="button">Cancel</button>
          <button type="button">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    let cancelled = false;
    root.querySelector('button').addEventListener('click', () => { cancelled = true; });
    expect(dismissTourDialogs()).toBe(true);
    expect(cancelled).toBe(true);
    root.remove();

    const alertRoot = document.createElement('div');
    alertRoot.className = 'bb-dialog-root';
    alertRoot.innerHTML = `
      <div class="bb-dialog">
        <h2 class="bb-dialog__title">Notice</h2>
        <p class="bb-dialog__message">Something happened</p>
        <div class="bb-dialog__footer">
          <button type="button">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(alertRoot);
    let ok = false;
    alertRoot.querySelector('button').addEventListener('click', () => { ok = true; });
    expect(dismissTourDialogs()).toBe(true);
    expect(ok).toBe(true);
  });

  it('discards unsaved confirms', () => {
    const root = document.createElement('div');
    root.className = 'bb-dialog-root';
    root.innerHTML = `
      <div class="bb-dialog">
        <h2 class="bb-dialog__title">Unsaved material</h2>
        <p class="bb-dialog__message">This material has unsaved changes. Leave Materials and discard them?</p>
        <div class="bb-dialog__footer">
          <button type="button">Keep editing</button>
          <button type="button">Discard</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    let discarded = false;
    root.querySelectorAll('button')[1].addEventListener('click', () => { discarded = true; });
    expect(dismissTourDialogs()).toBe(true);
    expect(discarded).toBe(true);
  });
});

describe('Academy tour dropdown dismiss', () => {
  it('fires outside clicks when a Cam / menu dropdown is open', () => {
    document.body.innerHTML = `
      <div class="bb-viewport-pane-menu is-open">
        <button type="button" aria-haspopup="menu" aria-expanded="true">Cam</button>
        <ul class="bb-viewport-pane-menu__list"><li>Perspective</li></ul>
      </div>
      <div class="bb-menu">
        <button type="button" class="bb-menu-trigger is-open">File</button>
        <ul class="bb-menu-list"><li>Save</li></ul>
      </div>
    `;
    const seen = [];
    const onDown = (e) => { seen.push(e.type); };
    document.documentElement.addEventListener('mousedown', onDown);
    document.documentElement.addEventListener('pointerdown', onDown);
    expect(dismissTourDropdowns()).toBe(true);
    expect(seen).toContain('mousedown');
    document.documentElement.removeEventListener('mousedown', onDown);
    document.documentElement.removeEventListener('pointerdown', onDown);
  });

  it('blurs a focused select', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option>A</option><option>B</option>';
    document.body.appendChild(select);
    select.focus();
    expect(document.activeElement).toBe(select);
    dismissTourDropdowns();
    expect(document.activeElement === select).toBe(false);
  });
});
