/**
 * Editor-wide most-used colors (localStorage). Shared by icon / layer color pickers.
 */

import { normalizeIconColor } from '../core/iconColor.js';

export const COLOR_HISTORY_STORAGE_KEY = 'bb.colorHistory.v1';
export const COLOR_HISTORY_MAX = 24;
export const COLOR_HISTORY_DISPLAY = 12;

/** Starter swatches shown when history is empty (and as a fixed quick row). */
export const DEFAULT_COLOR_PRESETS = [
  '#4a8fd4',
  '#8490a4',
  '#e8a04a',
  '#5ec28a',
  '#d45a6a',
  '#c49be0',
  '#e0d070',
  '#d4dce8',
];

function readRaw() {
  try {
    const raw = localStorage.getItem(COLOR_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeRaw(entries) {
  try {
    localStorage.setItem(COLOR_HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

export function loadColorHistory() {
  const out = [];
  const seen = new Set();
  for (const entry of readRaw()) {
    const color = normalizeIconColor(entry?.color);
    if (!color || seen.has(color)) continue;
    seen.add(color);
    out.push({
      color,
      count: Math.max(1, Number(entry.count) || 1),
      lastUsed: Number(entry.lastUsed) || 0,
    });
  }
  out.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  return out.slice(0, COLOR_HISTORY_MAX);
}

export function recordColorUse(raw) {
  const color = normalizeIconColor(raw);
  if (!color) return loadColorHistory();
  const list = loadColorHistory();
  const existing = list.find((e) => e.color === color);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = Date.now();
  } else {
    list.push({ color, count: 1, lastUsed: Date.now() });
  }
  list.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  const next = list.slice(0, COLOR_HISTORY_MAX);
  writeRaw(next);
  return next;
}

export function getMostUsedColors(limit = COLOR_HISTORY_DISPLAY) {
  return loadColorHistory()
    .slice(0, Math.max(0, limit))
    .map((e) => e.color);
}
