// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  coachCardCoversButton,
  dockIdForTutorialHighlight,
  getTutorialAnchorRect,
  positionCoachMark,
} from '../tutorials/positionCoachMark.js';

describe('positionCoachMark', () => {
  it('places the card near the anchor without leaving the layer', () => {
    const pos = positionCoachMark({
      anchor: { left: 100, top: 40, width: 80, height: 28, right: 180, bottom: 68 },
      panelWidth: 300,
      panelHeight: 200,
      layerWidth: 1200,
      layerHeight: 800,
    });
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.left + pos.width).toBeLessThanOrEqual(1200);
    expect(pos.arrow).toBeTruthy();
    expect(['below', 'above', 'left', 'right']).toContain(pos.placement);
  });

  it('keeps the card on-screen for edge anchors', () => {
    const pos = positionCoachMark({
      anchor: { left: 10, top: 10, width: 60, height: 24, right: 70, bottom: 34 },
      panelWidth: 320,
      panelHeight: 220,
      layerWidth: 800,
      layerHeight: 600,
    });
    expect(pos.left).toBeGreaterThanOrEqual(10);
    expect(pos.top).toBeGreaterThanOrEqual(10);
  });

  it('clears the tip off the action zone during tour', () => {
    const anchor = { left: 400, top: 40, width: 120, height: 28, right: 520, bottom: 68 };
    const viewport = {
      left: 200, top: 80, width: 600, height: 400, right: 800, bottom: 480,
    };
    const pos = positionCoachMark({
      anchor,
      panelWidth: 300,
      panelHeight: 160,
      layerWidth: 1000,
      layerHeight: 700,
      clearOfAction: true,
      avoidRects: [anchor, viewport],
    });
    const card = {
      left: pos.left,
      top: pos.top,
      width: pos.width,
      height: 160,
      right: pos.left + pos.width,
      bottom: pos.top + 160,
    };
    const overlap = !(
      card.right <= viewport.left
      || card.left >= viewport.right
      || card.bottom <= viewport.top
      || card.top >= viewport.bottom
    );
    expect(overlap).toBe(false);
  });

  it('never covers a top-edge toolbar button after clamping', () => {
    const anchor = { left: 8, top: 6, width: 44, height: 28, right: 52, bottom: 34 };
    const pos = positionCoachMark({
      anchor,
      panelWidth: 360,
      panelHeight: 260,
      layerWidth: 900,
      layerHeight: 640,
    });
    const card = {
      left: pos.left,
      top: pos.top,
      width: pos.width,
      height: 260,
      right: pos.left + pos.width,
      bottom: pos.top + 260,
    };
    expect(coachCardCoversButton(card, anchor)).toBe(false);
  });

  it('never covers a button when the tip would otherwise clamp onto it', () => {
    const anchor = { left: 10, top: 10, width: 80, height: 28, right: 90, bottom: 38 };
    const pos = positionCoachMark({
      anchor,
      panelWidth: 320,
      panelHeight: 220,
      layerWidth: 800,
      layerHeight: 600,
    });
    const card = {
      left: pos.left,
      top: pos.top,
      width: pos.width,
      height: 220,
      right: pos.left + pos.width,
      bottom: pos.top + 220,
    };
    expect(coachCardCoversButton(card, anchor)).toBe(false);
  });
});

describe('dock tab coach anchors', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('maps in-panel highlight ids to dock panel ids', () => {
    expect(dockIdForTutorialHighlight('details.staticMesh')).toBe('details');
    expect(dockIdForTutorialHighlight('outliner.category')).toBe('outliner');
    expect(dockIdForTutorialHighlight('content.folder')).toBe('content');
    expect(dockIdForTutorialHighlight('assetViewer.meshTools')).toBe('assetViewer');
    expect(dockIdForTutorialHighlight('panel.layers')).toBe('layers');
    expect(dockIdForTutorialHighlight('toolbar.select')).toBe(null);
  });

  it('anchors in-panel controls to the dock tab even when the control is visible', () => {
    document.body.innerHTML = `
      <div class="dv-tab" aria-label="Details"></div>
      <div data-bb-tutorial="panel.details">
        <button data-bb-tutorial="details.staticMesh">Mesh</button>
      </div>
    `;
    const btn = document.querySelector('[data-bb-tutorial="details.staticMesh"]');
    const tab = document.querySelector('.dv-tab');
    btn.getBoundingClientRect = () => ({
      left: 20, top: 80, width: 120, height: 20, right: 140, bottom: 100, x: 20, y: 80, toJSON() {},
    });
    tab.getBoundingClientRect = () => ({
      left: 10, top: 10, width: 80, height: 24, right: 90, bottom: 34, x: 10, y: 10, toJSON() {},
    });
    const hit = getTutorialAnchorRect(['details.staticMesh']);
    expect(hit.viaTab).toBe(true);
    expect(hit.el).toBe(tab);
  });

  it('anchors to the dock tab when the control is missing', () => {
    document.body.innerHTML = `
      <div class="dv-tab" aria-label="Details"></div>
    `;
    const tab = document.querySelector('.dv-tab');
    tab.getBoundingClientRect = () => ({
      left: 10, top: 10, width: 80, height: 24, right: 90, bottom: 34, x: 10, y: 10, toJSON() {},
    });
    const hit = getTutorialAnchorRect(['details.staticMesh']);
    expect(hit.viaTab).toBe(true);
    expect(hit.el).toBe(tab);
  });

  it('still anchors toolbar controls to themselves', () => {
    document.body.innerHTML = `
      <button data-bb-tutorial="toolbar.select" style="width:40px;height:28px">Select</button>
    `;
    const btn = document.querySelector('[data-bb-tutorial="toolbar.select"]');
    btn.getBoundingClientRect = () => ({
      left: 4, top: 4, width: 40, height: 28, right: 44, bottom: 32, x: 4, y: 4, toJSON() {},
    });
    const hit = getTutorialAnchorRect('toolbar.select');
    expect(hit.viaTab).toBe(false);
    expect(hit.el).toBe(btn);
  });
});

